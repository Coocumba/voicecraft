import { auth } from "@/auth"
import {
  prisma,
  SmsConversationStatus,
  SmsDirection,
  SmsSender,
} from "@voicecraft/db"
import { sendSms } from "@/lib/twilio"

/**
 * GET /api/messages
 *
 * List SMS conversations for the current user's SMS-enabled agents.
 * Supports optional query params:
 *   - agentId: filter by a specific agent
 *   - countOnly=true: return just { needsReplyCount } for TopBar badge
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get("agentId")
  const countOnly = searchParams.get("countOnly") === "true"

  try {
    // Build filter for user's SMS-enabled agents
    const agentFilter: Record<string, unknown> = {
      userId: session.user.id,
      smsEnabled: true,
    }
    if (agentId) {
      agentFilter.id = agentId
    }

    if (countOnly) {
      const needsReplyCount = await prisma.smsConversation.count({
        where: {
          agent: agentFilter,
          status: SmsConversationStatus.NEEDS_REPLY,
        },
      })
      return Response.json({ needsReplyCount })
    }

    const conversations = await prisma.smsConversation.findMany({
      where: {
        agent: agentFilter,
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        agent: {
          select: { id: true, name: true, businessName: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, sender: true, createdAt: true },
        },
      },
    })

    return Response.json({ conversations })
  } catch (err) {
    console.error("[GET /api/messages]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/messages
 *
 * Send an owner reply to a conversation.
 * Body: { conversationId, body }
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { conversationId, body } = payload as Record<string, unknown>

  if (typeof conversationId !== "string" || !conversationId) {
    return Response.json({ error: "conversationId is required" }, { status: 400 })
  }
  if (typeof body !== "string" || !body.trim()) {
    return Response.json({ error: "body is required" }, { status: 400 })
  }

  try {
    // Look up conversation and verify ownership
    const conversation = await prisma.smsConversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: {
          select: {
            userId: true,
            phoneNumber: true,
          },
        },
      },
    })

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 })
    }
    if (conversation.agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!conversation.agent.phoneNumber) {
      return Response.json(
        { error: "Agent has no phone number configured" },
        { status: 400 }
      )
    }

    // Send SMS via Twilio
    await sendSms(conversation.customerPhone, body.trim(), conversation.agent.phoneNumber)

    // Save message
    const message = await prisma.smsMessage.create({
      data: {
        conversationId,
        direction: SmsDirection.OUTBOUND,
        sender: SmsSender.OWNER,
        body: body.trim(),
      },
    })

    // Update conversation status and timestamp
    await prisma.smsConversation.update({
      where: { id: conversationId },
      data: {
        status: SmsConversationStatus.ACTIVE,
        lastMessageAt: new Date(),
      },
    })

    return Response.json({ message })
  } catch (err) {
    console.error("[POST /api/messages]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
