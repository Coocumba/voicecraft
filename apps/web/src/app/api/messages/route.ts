import { auth } from "@/auth"
import {
  prisma,
  MessagingStatus,
  MessageDirection,
  MessageSender,
  MessageChannel,
} from "@voicecraft/db"
import { sendWhatsApp } from "@/lib/whatsapp"

/**
 * GET /api/messages
 *
 * List WhatsApp conversations for the current user's WhatsApp-enabled agents.
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
    const agentFilter: Record<string, unknown> = {
      userId: session.user.id,
      whatsappEnabled: true,
    }
    if (agentId) {
      agentFilter.id = agentId
    }

    if (countOnly) {
      const needsReplyCount = await prisma.conversation.count({
        where: {
          agent: agentFilter,
          status: MessagingStatus.NEEDS_REPLY,
          channel: MessageChannel.WHATSAPP,
        },
      })
      return Response.json({ needsReplyCount })
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        agent: agentFilter,
        channel: MessageChannel.WHATSAPP,
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
 * Send an owner reply to a WhatsApp conversation.
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
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: {
          select: { userId: true, phoneNumber: true },
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
      return Response.json({ error: "Agent has no phone number configured" }, { status: 400 })
    }
    if (conversation.optedOut) {
      return Response.json({ error: "Customer has opted out of messages" }, { status: 400 })
    }

    await sendWhatsApp(conversation.customerPhone, body.trim(), conversation.agent.phoneNumber)

    const message = await prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.OWNER,
        body: body.trim(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: MessagingStatus.ACTIVE,
        lastMessageAt: new Date(),
      },
    })

    return Response.json({ message })
  } catch (err) {
    console.error("[POST /api/messages]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
