import { auth } from "@/auth"
import { prisma, CallOutcome } from "@voicecraft/db"
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library"
import { incrementUsage, checkThresholdCrossed, isTrialMinutesExhausted } from "@/lib/usage"
import { getCurrentUsageRecord, pauseUserAgents } from "@/lib/subscription"

// Allowed CallOutcome values for request body validation
const VALID_OUTCOMES = Object.values(CallOutcome) as string[]

function isValidOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && VALID_OUTCOMES.includes(value)
}

/**
 * Track call duration against usage records and enforce trial limits.
 * Runs after the response is sent so the agent gets a fast 201.
 */
async function trackUsageAfterCall(userId: string, duration: number) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { id: true, status: true },
  })

  if (!subscription) return

  const usageRecord = await getCurrentUsageRecord(userId, subscription.id)
  if (!usageRecord) return

  const prevMinutes = usageRecord.minutesUsed
  const updated = await incrementUsage(
    usageRecord.subscriptionId,
    usageRecord.periodStart,
    duration
  )

  if (!updated) return

  if (subscription.status === "TRIALING" && isTrialMinutesExhausted(updated.minutesUsed)) {
    await pauseUserAgents(userId)
    console.warn("[POST /api/calls] Trial minutes exhausted — agents paused", {
      userId,
      minutesUsed: updated.minutesUsed,
    })
  } else {
    const crossed = checkThresholdCrossed(
      prevMinutes,
      updated.minutesUsed,
      updated.minutesIncluded
    )
    if (crossed) {
      console.info("[POST /api/calls] Usage threshold crossed", {
        userId,
        threshold: crossed.label,
        minutesUsed: updated.minutesUsed,
        minutesIncluded: updated.minutesIncluded,
      })
    }
  }
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get("limit")
  const cursorParam = searchParams.get("cursor")
  const agentIdParam = searchParams.get("agentId")
  const outcomeParam = searchParams.get("outcome")

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20
  if (isNaN(limit) || limit < 1) {
    return Response.json({ error: "Invalid limit parameter" }, { status: 400 })
  }

  if (outcomeParam !== null && !isValidOutcome(outcomeParam)) {
    return Response.json(
      { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
      { status: 400 }
    )
  }

  try {
    const calls = await prisma.call.findMany({
      where: {
        agent: { userId: session.user.id },
        ...(agentIdParam ? { agentId: agentIdParam } : {}),
        ...(outcomeParam ? { outcome: outcomeParam as CallOutcome } : {}),
      },
      include: {
        agent: { select: { id: true, name: true, businessName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // fetch one extra to determine if there is a next page
      ...(cursorParam ? { cursor: { id: cursorParam }, skip: 1 } : {}),
    })

    const hasNextPage = calls.length > limit
    const items = hasNextPage ? calls.slice(0, limit) : calls
    const lastItem = items[items.length - 1]
    const nextCursor = hasNextPage && lastItem ? lastItem.id : null

    // Batch-look up contacts for all calls that have a callerNumber
    const phoneNumbers = [
      ...new Set(
        items
          .map((c) => c.callerNumber)
          .filter((p): p is string => p !== null && p !== undefined)
      ),
    ]

    const contacts =
      phoneNumbers.length > 0
        ? await prisma.contact.findMany({
            where: {
              userId: session.user.id,
              phone: { in: phoneNumbers },
            },
            select: { phone: true, name: true, callCount: true },
          })
        : []

    const contactByPhone = new Map(contacts.map((c) => [c.phone, c]))

    const callsWithContact = items.map((call) => {
      const contact = call.callerNumber
        ? (contactByPhone.get(call.callerNumber) ?? null)
        : null
      return {
        ...call,
        contactName: contact?.name ?? null,
        isReturningCaller: (contact?.callCount ?? 0) > 1,
      }
    })

    return Response.json({ calls: callsWithContact, nextCursor })
  } catch (err) {
    console.error("[GET /api/calls]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  // This endpoint is called by the agent worker — authenticated via API key
  const apiKey = request.headers.get("x-api-key")
  if (apiKey !== process.env.VOICECRAFT_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { agentId, callerNumber, duration, outcome, transcript, summary } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400 })
  }
  if (!isValidOutcome(outcome)) {
    return Response.json(
      { error: `outcome is required and must be one of: ${VALID_OUTCOMES.join(", ")}` },
      { status: 400 }
    )
  }
  if (duration !== undefined && (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0)) {
    return Response.json({ error: "duration must be a non-negative integer (seconds)" }, { status: 400 })
  }

  try {
    // Combine agent lookup + call creation into a single create with a
    // relation check — Prisma will fail if the agentId doesn't exist
    // (foreign key constraint), so we don't need a separate findUnique.
    const call = await prisma.call.create({
      data: {
        agentId: agentId.trim(),
        callerNumber: typeof callerNumber === "string" ? callerNumber : undefined,
        duration: typeof duration === "number" ? duration : undefined,
        outcome,
        transcript: typeof transcript === "string" ? transcript : undefined,
        summary: typeof summary === "string" ? summary : undefined,
      },
      include: { agent: { select: { userId: true } } },
    })

    // Run usage tracking and contact upsert in parallel — both are
    // independent of each other and neither blocks the call record.
    // We must await them (not fire-and-forget) because serverless
    // platforms kill pending promises once the response is returned.
    const userId = call.agent.userId
    const backgroundTasks: Promise<void>[] = []

    if (typeof duration === "number" && duration > 0) {
      backgroundTasks.push(
        trackUsageAfterCall(userId, duration).catch((err) => {
          console.error("[POST /api/calls] Usage tracking failed", err)
        })
      )
    }

    if (typeof callerNumber === "string" && callerNumber.trim() !== "") {
      const phone = callerNumber.trim()
      backgroundTasks.push(
        prisma.contact
          .upsert({
            where: { userId_phone: { userId, phone } },
            update: {
              callCount: { increment: 1 },
              lastCalledAt: new Date(),
            },
            create: {
              userId,
              phone,
              callCount: 1,
              lastCalledAt: new Date(),
            },
          })
          .then(() => {})
          .catch((err: unknown) => {
            console.error("[POST /api/calls] contact upsert failed", err)
          })
      )
    }

    // Await all background tasks in parallel — the agent worker waits
    // for this response, but the tasks run concurrently so total latency
    // is max(usage_tracking, contact_upsert) rather than their sum.
    await Promise.allSettled(backgroundTasks)

    return Response.json({ call: { id: call.id } }, { status: 201 })
  } catch (err) {
    // If the call create fails due to invalid agentId (FK violation),
    // return 404 instead of 500. Uses Prisma error code P2003 which is
    // stable across versions, unlike error message text.
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2003") {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    console.error("[POST /api/calls]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
