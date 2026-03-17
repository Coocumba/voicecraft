import { auth } from "@/auth"
import { prisma, ConversationStatus } from "@voicecraft/db"
import { BUILDER_SYSTEM_PROMPT, BUILDER_READY_SIGNAL } from "@/lib/builder-prompt"
import { chatCompletion } from "@/lib/llm"
import { rateLimit } from "@/lib/rate-limit"

const RATE_LIMIT_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 60 * 1000

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

  const { success } = rateLimit(session.user.id, {
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

  const { conversationId, message, agentId: editAgentId } = body as Record<string, unknown>

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

    const existingMessages: ConversationMessage[] = isMessageArray(conversation.messages)
      ? conversation.messages
      : []

    const updatedMessages: ConversationMessage[] = [
      ...existingMessages,
      { role: "user", content: userMessage },
    ]

    // In edit mode, append the existing agent config to the system prompt
    // so the AI knows what it's modifying — invisible to the user.
    let systemPrompt = BUILDER_SYSTEM_PROMPT
    if (typeof editAgentId === "string" && existingMessages.length === 0) {
      const existingAgent = await prisma.agent.findUnique({
        where: { id: editAgentId },
      })
      if (existingAgent?.config && typeof existingAgent.config === "object") {
        systemPrompt += `\n\n## Edit Mode\nThe user is editing an existing agent. Here is the current configuration (JSON):\n\`\`\`json\n${JSON.stringify(existingAgent.config, null, 2)}\n\`\`\`\nDo NOT ask the user to describe their business again — you already know it. Focus only on what they want to change. Acknowledge the current setup briefly, then ask what specific changes they want.`
      }
    }

    const llmResponse = await chatCompletion({
      system: systemPrompt,
      messages: updatedMessages,
      maxTokens: 1024,
    })

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: llmResponse.content,
    }

    const finalMessages: ConversationMessage[] = [...updatedMessages, assistantMessage]

    const messagesJson = finalMessages as unknown as Parameters<
      typeof prisma.builderConversation.update
    >[0]["data"]["messages"]

    // Derive progress: count user messages before the new message was appended, capped at 5
    const userMessageCount = existingMessages.filter((m) => m.role === "user").length
    const topicsCovered = Math.min(userMessageCount, 5)

    // Ready when AI's response contains the [READY] tag
    const ready = assistantMessage.content.includes(BUILDER_READY_SIGNAL)

    // Strip the [READY] tag from the message before saving/returning
    if (ready) {
      assistantMessage.content = assistantMessage.content
        .replace(/\[READY\]/g, '')
        .trim()
    }

    // Merge both updates into a single write to eliminate the race window between
    // saving messages and marking the conversation COMPLETED.
    const updatedConversation = await prisma.builderConversation.update({
      where: { id: conversation.id },
      data: {
        messages: messagesJson,
        ...(ready ? { status: ConversationStatus.COMPLETED } : {}),
      },
    })

    return Response.json({
      conversationId: updatedConversation.id,
      response: assistantMessage.content,
      messages: finalMessages,
      topicsCovered,
      ready,
    })
  } catch (err) {
    console.error("[POST /api/builder/message]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
