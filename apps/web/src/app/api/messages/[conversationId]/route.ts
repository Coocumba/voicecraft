import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

/**
 * GET /api/messages/[conversationId]
 *
 * Return conversation metadata and all messages in chronological order.
 * Session authenticated — verifies the conversation's agent belongs to the user.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { conversationId } = await params

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            businessName: true,
            userId: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    })

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 })
    }
    if (conversation.agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Strip internal userId from response
    const { userId: _userId, ...agentData } = conversation.agent

    return Response.json({
      conversation: {
        ...conversation,
        agent: agentData,
      },
    })
  } catch (err) {
    console.error("[GET /api/messages/:conversationId]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
