import { auth } from "@/auth"
import { prisma, CallOutcome } from "@voicecraft/db"

// Allowed CallOutcome values for request body validation
const VALID_OUTCOMES = Object.values(CallOutcome) as string[]

function isValidOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && VALID_OUTCOMES.includes(value)
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
    // Verify the agent exists before logging a call against it
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }

    const call = await prisma.call.create({
      data: {
        agentId: agentId.trim(),
        callerNumber: typeof callerNumber === "string" ? callerNumber : undefined,
        duration: typeof duration === "number" ? duration : undefined,
        outcome,
        transcript: typeof transcript === "string" ? transcript : undefined,
        summary: typeof summary === "string" ? summary : undefined,
      },
    })

    // Fire-and-forget contact upsert — does not block the response
    if (typeof callerNumber === "string" && callerNumber.trim() !== "") {
      const phone = callerNumber.trim()
      prisma.contact
        .upsert({
          where: { userId_phone: { userId: agent.userId, phone } },
          update: {
            callCount: { increment: 1 },
            lastCalledAt: new Date(),
          },
          create: {
            userId: agent.userId,
            phone,
            callCount: 1,
            lastCalledAt: new Date(),
          },
        })
        .catch((err: unknown) => {
          console.error("[POST /api/calls] contact upsert failed", err)
        })
    }

    return Response.json({ call }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/calls]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
