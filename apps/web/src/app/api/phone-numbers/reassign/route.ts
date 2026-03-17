import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { reassignNumber } from "@/lib/phone-pool"

/**
 * POST — Reassign a provisioned number from one agent to another.
 *
 * Body: { agentId: string, toAgentId: string }
 *
 * Both agents must belong to the authenticated user. The source agent must
 * have an assigned PhoneNumber record.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
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

  const { agentId, toAgentId } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400 })
  }
  if (typeof toAgentId !== "string" || toAgentId.trim() === "") {
    return Response.json({ error: "toAgentId is required" }, { status: 400 })
  }

  try {
    // Verify both agents belong to this user
    const [sourceAgent, targetAgent] = await Promise.all([
      prisma.agent.findUnique({ where: { id: agentId.trim() }, select: { id: true, userId: true } }),
      prisma.agent.findUnique({ where: { id: toAgentId.trim() }, select: { id: true, userId: true, phoneNumber: true } }),
    ])

    if (!sourceAgent) {
      return Response.json({ error: "Source agent not found" }, { status: 404 })
    }
    if (sourceAgent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!targetAgent) {
      return Response.json({ error: "Target agent not found" }, { status: 404 })
    }
    if (targetAgent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (targetAgent.phoneNumber) {
      return Response.json({ error: "Target agent already has a phone number" }, { status: 409 })
    }

    // Find the PhoneNumber record for the source agent
    const poolNumber = await prisma.phoneNumber.findUnique({ where: { agentId: agentId.trim() } })
    if (!poolNumber) {
      return Response.json({ error: "Source agent has no pool number record" }, { status: 404 })
    }

    const updated = await reassignNumber(poolNumber.id, toAgentId.trim(), session.user.id)

    // Update denormalized phone number fields on both agents
    await Promise.all([
      prisma.agent.update({
        where: { id: agentId.trim() },
        data: { phoneNumber: null, phoneNumberSid: null, phoneNumberSource: null },
      }),
      prisma.agent.update({
        where: { id: toAgentId.trim() },
        data: {
          phoneNumber: updated.number,
          phoneNumberSid: updated.twilioSid,
          phoneNumberSource: "provisioned",
        },
      }),
    ])

    return Response.json({ phoneNumber: updated })
  } catch (err) {
    console.error("[POST /api/phone-numbers/reassign]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
