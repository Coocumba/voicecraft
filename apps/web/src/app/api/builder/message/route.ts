import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { prisma, ConversationStatus } from "@voicecraft/db"
import { BUILDER_SYSTEM_PROMPT } from "@/lib/builder-prompt"
import { rateLimit } from "@/lib/rate-limit"

const RATE_LIMIT_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute

const anthropic = new Anthropic()

// Shape of each message stored in the BuilderConversation.messages JSON array
interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

function isMessageArray(value: unknown): value is ConversationMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).role === "user" ||
        (typeof item === "object" &&
          item !== null &&
          (item as Record<string, unknown>).role === "assistant") &&
          typeof (item as Record<string, unknown>).content === "string"
    )
  )
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { success, remaining } = rateLimit(session.user.id, {
    limit: RATE_LIMIT_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
          "X-RateLimit-Limit": String(RATE_LIMIT_REQUESTS),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
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

  const { conversationId, message } = body as Record<string, unknown>

  if (typeof message !== "string" || message.trim() === "") {
    return Response.json({ error: "message is required and must be a non-empty string" }, { status: 400 })
  }

  const userMessage = message.trim()

  try {
    let conversation: Awaited<ReturnType<typeof prisma.builderConversation.create>> | null = null

    if (conversationId !== undefined) {
      if (typeof conversationId !== "string") {
        return Response.json({ error: "conversationId must be a string" }, { status: 400 })
      }

      conversation = await prisma.builderConversation.findUnique({
        where: { id: conversationId },
      })

      if (!conversation) {
        return Response.json({ error: "Conversation not found" }, { status: 404 })
      }
      if (conversation.userId !== session.user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 })
      }
      if (conversation.status === ConversationStatus.COMPLETED) {
        return Response.json({ error: "Conversation is already completed" }, { status: 409 })
      }
    } else {
      // Create a new conversation with an empty message history.
      // The empty array cast is necessary for the same Prisma InputJsonValue reason.
      const emptyMessages = [] as unknown as Parameters<
        typeof prisma.builderConversation.create
      >[0]["data"]["messages"]
      conversation = await prisma.builderConversation.create({
        data: {
          userId: session.user.id,
          messages: emptyMessages,
          status: ConversationStatus.IN_PROGRESS,
        },
      })
    }

    // Retrieve existing messages and append the new user message
    const existingMessages: ConversationMessage[] = isMessageArray(conversation.messages)
      ? conversation.messages
      : []

    const updatedMessages: ConversationMessage[] = [
      ...existingMessages,
      { role: "user", content: userMessage },
    ]

    // Call Claude Sonnet with the full conversation history
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: BUILDER_SYSTEM_PROMPT,
      messages: updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    })

    const assistantContent = claudeResponse.content[0]
    if (!assistantContent || assistantContent.type !== "text") {
      throw new Error("Unexpected response type from Claude")
    }

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: assistantContent.text,
    }

    const finalMessages: ConversationMessage[] = [...updatedMessages, assistantMessage]

    // Persist the updated message history.
    // ConversationMessage[] is a valid JSON array; cast through unknown because Prisma's
    // InputJsonValue requires a string index signature that a typed array doesn't satisfy.
    const messagesJson = finalMessages as unknown as Parameters<
      typeof prisma.builderConversation.update
    >[0]["data"]["messages"]

    const updatedConversation = await prisma.builderConversation.update({
      where: { id: conversation.id },
      data: { messages: messagesJson },
    })

    return Response.json({
      conversationId: updatedConversation.id,
      response: assistantMessage.content,
      messages: finalMessages,
    })
  } catch (err) {
    console.error("[POST /api/builder/message]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
