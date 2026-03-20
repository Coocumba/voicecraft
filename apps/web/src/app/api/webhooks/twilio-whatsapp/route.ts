import {
  prisma,
  MessagingStatus,
  MessageDirection,
  MessageSender,
  MessageChannel,
} from "@voicecraft/db"
import { validateTwilioSignature } from "@/lib/twilio"
import { sendWhatsApp } from "@/lib/whatsapp"
import { chatCompletion } from "@/lib/llm"
import { buildMessagingSystemPrompt } from "@/lib/messaging-prompt"
import { parseSmsResponse } from "@/lib/sms-response-parser"
import { handleAction } from "@/lib/messaging-actions"
import { rateLimit } from "@/lib/rate-limit"
import type { AgentConfig } from "@/lib/builder-types"

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function twimlResponse() {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

/**
 * POST /api/webhooks/twilio-whatsapp
 *
 * Inbound WhatsApp message from a customer. Twilio delivers this with
 * From/To in the format: whatsapp:+E164
 */
export async function POST(request: Request) {
  // ── 1. Validate Twilio signature ────────────────────────────────────────
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = String(value) })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl ? `${appUrl}/api/webhooks/twilio-whatsapp` : request.url

  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-whatsapp] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  // ── 2. Parse numbers (strip whatsapp: prefix) ───────────────────────────
  const customerPhone = (params["From"] ?? "").replace(/^whatsapp:/, "")
  const agentPhone = (params["To"] ?? "").replace(/^whatsapp:/, "")
  const body = (params["Body"] ?? "").trim()
  const twilioSid = params["MessageSid"] ?? null

  if (!customerPhone || !agentPhone) {
    console.warn("[twilio-whatsapp] Missing From or To", params)
    return twimlResponse()
  }

  // ── 3. Rate limit ────────────────────────────────────────────────────────
  const rl = rateLimit(`wa:${customerPhone}`, { limit: 10, windowMs: 5 * 60 * 1000 })
  if (!rl.success) {
    console.warn("[twilio-whatsapp] Rate limited", { customerPhone })
    return twimlResponse()
  }

  // ── 4. Look up agent ─────────────────────────────────────────────────────
  const agent = await prisma.agent.findFirst({
    where: { phoneNumber: agentPhone, whatsappEnabled: true },
  })

  if (!agent) {
    console.warn("[twilio-whatsapp] No WhatsApp-enabled agent for number", { agentPhone })
    return twimlResponse()
  }

  // ── 5. Find or create conversation (without updating status yet) ──────────
  // We must check opt-out BEFORE mutating status/lastMessageAt, so we use
  // findUnique + conditional create rather than a plain upsert.
  let conversation = await prisma.conversation.findUnique({
    where: {
      agentId_customerPhone_channel: {
        agentId: agent.id,
        customerPhone,
        channel: MessageChannel.WHATSAPP,
      },
    },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        agentId: agent.id,
        customerPhone,
        channel: MessageChannel.WHATSAPP,
        lastMessageAt: new Date(),
        status: MessagingStatus.ACTIVE,
      },
    })
  }

  // ── 6. Check opt-out BEFORE mutating conversation ─────────────────────────
  if (conversation.optedOut) {
    console.info("[twilio-whatsapp] Customer opted out, dropping message", { customerPhone })
    return twimlResponse()
  }

  // Update status and timestamp now that we know the customer is not opted out.
  // ── 7. Save inbound message ──────────────────────────────────────────────
  // Both writes are independent — run them in parallel.
  await Promise.all([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: MessagingStatus.ACTIVE },
    }),
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        sender: MessageSender.CUSTOMER,
        body: body || "(media message)",
        twilioSid,
      },
    }),
  ])

  // ── 8. Handle media-only messages ────────────────────────────────────────
  if (!body) {
    try {
      await sendAndSave(conversation.id, customerPhone, agentPhone, "We can only respond to text messages at this time.")
    } catch (err) {
      console.error("[twilio-whatsapp] Failed to send media fallback", err)
    }
    return twimlResponse()
  }

  // ── 9. Generate AI reply ─────────────────────────────────────────────────
  try {
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
    recentMessages.reverse()

    const config = agent.config as AgentConfig
    const systemPrompt = buildMessagingSystemPrompt(config)

    const llmMessages = recentMessages.map((m) => ({
      role: (m.sender === MessageSender.CUSTOMER ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }))

    const llmResponse = await chatCompletion({ system: systemPrompt, messages: llmMessages, maxTokens: 512 })
    const parsed = parseSmsResponse(llmResponse.content)

    // Save bot reply
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.BOT,
        body: parsed.reply,
      },
    })

    // Send reply
    await sendWhatsApp(customerPhone, parsed.reply, agentPhone)

    // Handle handoff
    if (parsed.handoff) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: MessagingStatus.NEEDS_REPLY },
      })
    }

    // Handle booking/availability/cancel actions
    if (parsed.action && parsed.actionData) {
      await handleAction(
        parsed.action,
        parsed.actionData,
        agent,
        conversation.id,
        customerPhone,
        agentPhone,
        config,
        sendAndSave
      )
    }

    return twimlResponse()
  } catch (err) {
    console.error("[twilio-whatsapp] Error generating AI response", err)

    try {
      await sendAndSave(
        conversation.id,
        customerPhone,
        agentPhone,
        "Thanks for your message! We'll get back to you shortly."
      )
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: MessagingStatus.NEEDS_REPLY },
      })
    } catch (fallbackErr) {
      console.error("[twilio-whatsapp] Fallback also failed", fallbackErr)
    }

    return twimlResponse()
  }
}

/**
 * Save an outbound message to the DB and send it via WhatsApp.
 */
async function sendAndSave(
  conversationId: string,
  to: string,
  from: string,
  body: string
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      direction: MessageDirection.OUTBOUND,
      sender: MessageSender.BOT,
      body,
    },
  })
  await sendWhatsApp(to, body, from)
}
