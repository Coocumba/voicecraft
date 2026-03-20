import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { getEffectiveMaxAgents } from "@/lib/plans"
import { getUserSubscription, isSubscriptionBlocked } from "@/lib/subscription"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const agents = await prisma.agent.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ agents })
  } catch (err) {
    console.error("[GET /api/agents]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Enforce subscription and agent cap before doing any body parsing.
  const subscription = await getUserSubscription(session.user.id)
  if (!subscription || isSubscriptionBlocked(subscription.status)) {
    return Response.json(
      { error: "An active subscription is required to create agents" },
      { status: 403 }
    )
  }

  const maxAgents = await getEffectiveMaxAgents(subscription)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { name, businessName, config, voiceSettings, conversationId } = body as Record<string, unknown>

  if (typeof name !== "string" || name.trim() === "") {
    return Response.json({ error: "name is required and must be a non-empty string" }, { status: 400 })
  }
  if (typeof businessName !== "string" || businessName.trim() === "") {
    return Response.json({ error: "businessName is required and must be a non-empty string" }, { status: 400 })
  }
  if (config === undefined || config === null) {
    return Response.json({ error: "config is required" }, { status: 400 })
  }

  try {
    const configJson = config as Parameters<typeof prisma.agent.create>[0]["data"]["config"]

    // Wrap the count check and create in a single transaction so two simultaneous
    // requests cannot both pass the limit check and both create an agent.
    // The SELECT ... FOR UPDATE acquires a row-level lock for the duration of the
    // transaction, preventing interleaved inserts from the same user.
    const agent = await prisma.$transaction(async (tx) => {
      const [{ count }] = await tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Agent"
        WHERE "userId" = ${session.user.id} AND "status" != 'INACTIVE'
        FOR UPDATE
      `
      if (Number(count) >= maxAgents) {
        throw Object.assign(new Error("AGENT_LIMIT_REACHED"), { maxAgents })
      }

      return tx.agent.create({
        data: {
          userId: session.user.id,
          name: name.trim(),
          businessName: businessName.trim(),
          config: configJson,
          ...(voiceSettings !== undefined && voiceSettings !== null
            ? { voiceSettings: voiceSettings as Parameters<typeof prisma.agent.create>[0]["data"]["voiceSettings"] }
            : {}),
          ...(typeof conversationId === "string" && conversationId ? { conversationId } : {}),
        },
      })
    })

    return Response.json({ agent }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === "AGENT_LIMIT_REACHED") {
      return Response.json(
        { error: `Agent limit reached. Your plan allows up to ${maxAgents} active agent(s).` },
        { status: 403 }
      )
    }
    console.error("[POST /api/agents]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
