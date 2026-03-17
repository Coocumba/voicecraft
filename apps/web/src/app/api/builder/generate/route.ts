import { auth } from "@/auth"
import { prisma, ConversationStatus } from "@voicecraft/db"
import { chatCompletion } from "@/lib/llm"

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

function isMessageArray(value: unknown): value is ConversationMessage[] {
  return Array.isArray(value)
}

const EXTRACTION_PROMPT = `You are a configuration extractor. Given a conversation between a user and an assistant about setting up a voice agent for any business, extract the structured configuration as valid JSON.

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
  "voice": { "gender": "male" | "female", "style": "string" },
  "language": "string",
  "greeting": "string",
  "escalation_rules": ["string"],
  "can_book_appointments": boolean,
  "timezone": "string | null"
}

Rules:
- Use null for days the business is closed.
- Use 24-hour time (e.g., "09:00", "17:30").
- duration is in minutes (integer). Use 0 if duration is not applicable for this business type.
- price is in USD (number, no currency symbol). Use 0 if price is not applicable.
- escalation_rules is an array of plain-English strings describing when to transfer to a human.
- voice.gender should be "male" or "female". voice.style is a brief descriptor like "warm", "calm", "energetic" (use "warm" as default).
- If a field cannot be determined from the conversation, use a sensible default (e.g., empty array, "friendly" tone, "female" voice gender, "en" language).
- Adapt the services list to the actual business type (products, services, offerings, menu items, etc.).
- Set can_book_appointments to true if the conversation mentions booking, scheduling, appointments, or reservations. Set to false for info-only or message-taking agents.
- Infer timezone from the business location if mentioned. Use IANA timezone format (e.g. "America/New_York", "Asia/Kolkata"). Set to null if location is unclear.
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

    const llmResponse = await chatCompletion({
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extract the agent configuration from this conversation:\n\n${transcript}`,
        },
      ],
      maxTokens: 2048,
    })

    let generatedConfig: unknown
    try {
      generatedConfig = JSON.parse(llmResponse.content)
    } catch {
      console.error("[POST /api/builder/generate] LLM returned non-JSON:", llmResponse.content)
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
