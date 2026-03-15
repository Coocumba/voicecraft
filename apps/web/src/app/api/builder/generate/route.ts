import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { prisma, ConversationStatus } from "@voicecraft/db"

const anthropic = new Anthropic()

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

function isMessageArray(value: unknown): value is ConversationMessage[] {
  return Array.isArray(value)
}

const EXTRACTION_PROMPT = `You are a configuration extractor. Given a conversation between a user and an assistant about setting up a dental clinic voice agent, extract the structured configuration as valid JSON.

Output ONLY a JSON object with no surrounding text, code fences, or explanation. Use this exact schema:

{
  "business_name": "string",
  "hours": {
    "monday":    { "open": "HH:MM", "close": "HH:MM" } | null,
    "tuesday":   { "open": "HH:MM", "close": "HH:MM" } | null,
    "wednesday": { "open": "HH:MM", "close": "HH:MM" } | null,
    "thursday":  { "open": "HH:MM", "close": "HH:MM" } | null,
    "friday":    { "open": "HH:MM", "close": "HH:MM" } | null,
    "saturday":  { "open": "HH:MM", "close": "HH:MM" } | null,
    "sunday":    { "open": "HH:MM", "close": "HH:MM" } | null
  },
  "services": [
    { "name": "string", "duration": number, "price": number }
  ],
  "tone": "formal" | "friendly" | "neutral",
  "language": "string",
  "greeting": "string",
  "escalation_rules": ["string"]
}

Rules:
- Use null for days the clinic is closed.
- Use 24-hour time (e.g., "09:00", "17:30").
- duration is in minutes (integer).
- price is in USD (number, no currency symbol).
- escalation_rules is an array of plain-English strings describing when to transfer.
- If a field cannot be determined from the conversation, use a sensible default (e.g., empty array, "friendly" tone, "en" language).
- Never add extra keys or wrapper objects.`

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

  const { conversationId } = body as Record<string, unknown>

  if (typeof conversationId !== "string" || conversationId.trim() === "") {
    return Response.json({ error: "conversationId is required" }, { status: 400 })
  }

  try {
    const conversation = await prisma.builderConversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 })
    }
    if (conversation.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    const messages: ConversationMessage[] = isMessageArray(conversation.messages)
      ? (conversation.messages as ConversationMessage[])
      : []

    if (messages.length === 0) {
      return Response.json({ error: "Conversation has no messages to extract from" }, { status: 422 })
    }

    // Format the conversation as a readable transcript for extraction
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n")

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extract the agent configuration from this conversation:\n\n${transcript}`,
        },
      ],
    })

    const rawContent = claudeResponse.content[0]
    if (!rawContent || rawContent.type !== "text") {
      throw new Error("Unexpected response type from Claude during extraction")
    }

    let generatedConfig: unknown
    try {
      generatedConfig = JSON.parse(rawContent.text)
    } catch {
      console.error("[POST /api/builder/generate] Claude returned non-JSON:", rawContent.text)
      return Response.json(
        { error: "Failed to parse generated configuration — please try again" },
        { status: 502 }
      )
    }

    // Persist the generated config and mark the conversation as completed.
    // Cast through unknown for Prisma's InputJsonValue constraint.
    const configJson = generatedConfig as Parameters<
      typeof prisma.builderConversation.update
    >[0]["data"]["generatedConfig"]

    await prisma.builderConversation.update({
      where: { id: conversationId },
      data: {
        generatedConfig: configJson,
        status: ConversationStatus.COMPLETED,
      },
    })

    return Response.json({ config: generatedConfig })
  } catch (err) {
    console.error("[POST /api/builder/generate]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
