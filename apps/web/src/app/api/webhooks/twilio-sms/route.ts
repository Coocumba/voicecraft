import {
  prisma,
  SmsConversationStatus,
  SmsDirection,
  SmsSender,
  AppointmentStatus,
} from "@voicecraft/db"
import { validateTwilioSignature, sendSms } from "@/lib/twilio"
import { chatCompletion } from "@/lib/llm"
import { buildSmsSystemPrompt } from "@/lib/sms-prompt"
import { parseSmsResponse } from "@/lib/sms-response-parser"
import { rateLimit } from "@/lib/rate-limit"
import { generateSlots } from "@/lib/slot-generator"
import {
  getCalendarEventsForDate,
  bookAppointment,
  deleteCalendarEvent,
} from "@/lib/google-calendar"
import { getDayName } from "@/lib/timezone-utils"
import type { AgentConfig } from "@/lib/builder-types"

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function twimlResponse() {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

/**
 * Save an outbound SMS message and send it via Twilio.
 */
async function sendFollowUp(
  conversationId: string,
  to: string,
  from: string,
  body: string
): Promise<void> {
  await prisma.smsMessage.create({
    data: {
      conversationId,
      direction: SmsDirection.OUTBOUND,
      sender: SmsSender.BOT,
      body,
    },
  })

  await sendSms(to, body, from)
}

/**
 * POST /api/webhooks/twilio-sms
 *
 * Inbound SMS webhook — Twilio calls this when a customer texts
 * an agent's provisioned phone number.
 */
export async function POST(request: Request) {
  // ── Parse Twilio form data ──────────────────────────────────────────
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    params[key] = String(value)
  })

  // ── Validate Twilio signature ───────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl
    ? `${appUrl}/api/webhooks/twilio-sms`
    : request.url
  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-sms] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  const customerPhone = params["From"] ?? null
  const agentPhone = params["To"] ?? null
  const body = (params["Body"] ?? "").trim()
  const twilioSid = params["MessageSid"] ?? null

  if (!customerPhone || !agentPhone) {
    console.warn("[twilio-sms] Missing From or To", params)
    return twimlResponse()
  }

  // ── Rate limit: 10 messages per 5 minutes per customer phone ──────
  const rl = rateLimit(`sms:${customerPhone}`, {
    limit: 10,
    windowMs: 5 * 60 * 1000,
  })
  if (!rl.success) {
    console.warn("[twilio-sms] Rate limited", { customerPhone })
    return twimlResponse()
  }

  // ── Look up agent via PhoneNumber model ─────────────────────────────
  const phoneRecord = await prisma.phoneNumber.findUnique({
    where: { number: agentPhone },
  })

  if (!phoneRecord?.agentId) {
    console.warn("[twilio-sms] No agent for number", { agentPhone })
    return twimlResponse()
  }

  const agent = await prisma.agent.findUnique({
    where: { id: phoneRecord.agentId },
  })

  if (!agent || !agent.smsEnabled) {
    console.warn("[twilio-sms] Agent not found or SMS disabled", {
      agentPhone,
      agentId: phoneRecord.agentId,
    })
    return twimlResponse()
  }

  // ── Upsert conversation ─────────────────────────────────────────────
  const conversation = await prisma.smsConversation.upsert({
    where: {
      agentId_customerPhone: {
        agentId: agent.id,
        customerPhone,
      },
    },
    update: {
      lastMessageAt: new Date(),
      status: SmsConversationStatus.ACTIVE,
    },
    create: {
      agentId: agent.id,
      customerPhone,
      lastMessageAt: new Date(),
      status: SmsConversationStatus.ACTIVE,
    },
  })

  // ── Save inbound message ────────────────────────────────────────────
  await prisma.smsMessage.create({
    data: {
      conversationId: conversation.id,
      direction: SmsDirection.INBOUND,
      sender: SmsSender.CUSTOMER,
      body: body || "(media message)",
      twilioSid,
    },
  })

  // ── Handle empty body (MMS / media-only) ────────────────────────────
  if (!body) {
    try {
      await sendFollowUp(
        conversation.id,
        customerPhone,
        agentPhone,
        "We can only respond to text messages at this time."
      )
    } catch (err) {
      console.error("[twilio-sms] Failed to send MMS fallback", err)
    }
    return twimlResponse()
  }

  // ── Build AI response ───────────────────────────────────────────────
  try {
    // Load last 10 messages for context
    const recentMessages = await prisma.smsMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    // Reverse so they're in chronological order
    recentMessages.reverse()

    const config = agent.config as AgentConfig
    const systemPrompt = buildSmsSystemPrompt(config)

    const llmMessages = recentMessages.map((m) => ({
      role: (m.sender === SmsSender.CUSTOMER ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.body,
    }))

    const llmResponse = await chatCompletion({
      system: systemPrompt,
      messages: llmMessages,
      maxTokens: 512,
    })

    const parsed = parseSmsResponse(llmResponse.content)

    // ── Save bot reply ──────────────────────────────────────────────
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: SmsDirection.OUTBOUND,
        sender: SmsSender.BOT,
        body: parsed.reply,
      },
    })

    // ── Send reply via Twilio ───────────────────────────────────────
    await sendSms(customerPhone, parsed.reply, agentPhone)

    // ── Handle handoff ──────────────────────────────────────────────
    if (parsed.handoff) {
      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { status: SmsConversationStatus.NEEDS_REPLY },
      })
    }

    // ── Handle actions (after initial reply is sent) ────────────────
    if (parsed.action && parsed.actionData) {
      await handleAction(
        parsed.action,
        parsed.actionData,
        agent,
        conversation.id,
        customerPhone,
        agentPhone,
        config
      )
    }

    return twimlResponse()
  } catch (err) {
    console.error("[twilio-sms] Error generating AI response", err)

    // Fallback: send a generic reply and flag for human follow-up
    try {
      await sendFollowUp(
        conversation.id,
        customerPhone,
        agentPhone,
        "Thanks for your message! We'll get back to you shortly."
      )

      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { status: SmsConversationStatus.NEEDS_REPLY },
      })
    } catch (fallbackErr) {
      console.error("[twilio-sms] Fallback SMS also failed", fallbackErr)
    }

    return twimlResponse()
  }
}

// ---------------------------------------------------------------------------
// Action handling
// ---------------------------------------------------------------------------

async function handleAction(
  action: "check_availability" | "book" | "cancel",
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig
): Promise<void> {
  try {
    switch (action) {
      case "check_availability":
        await handleCheckAvailability(
          actionData,
          agent,
          conversationId,
          customerPhone,
          agentPhone,
          config
        )
        break

      case "book":
        await handleBook(
          actionData,
          agent,
          conversationId,
          customerPhone,
          agentPhone,
          config
        )
        break

      case "cancel":
        await handleCancel(
          agent,
          conversationId,
          customerPhone,
          agentPhone
        )
        break
    }
  } catch (err) {
    console.error(`[twilio-sms] Action "${action}" failed`, err)
  }
}

async function handleCheckAvailability(
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig
): Promise<void> {
  const date = actionData.date
  if (!date) return

  const timezone = config.timezone ?? "America/New_York"
  const dayName = getDayName(date, timezone)

  // Check if the day is closed
  const dayHours = config.hours?.[dayName] ?? null
  if (!dayHours) {
    await sendFollowUp(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we're closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s. Please choose another day.`
    )
    return
  }

  // Generate slots
  const defaultDuration =
    config.services && config.services.length > 0
      ? config.services[0]!.duration
      : 30
  const allSlots = generateSlots(
    date,
    dayHours.open,
    dayHours.close,
    defaultDuration,
    timezone
  )

  // Filter against calendar events
  let availableSlots = allSlots
  try {
    const events = await getCalendarEventsForDate(agent.userId, date, timezone)
    availableSlots = allSlots.filter((slotIso) => {
      const slotStart = new Date(slotIso).getTime()
      const slotEnd = slotStart + defaultDuration * 60 * 1000
      return !events.some(
        (e) => slotStart < e.end.getTime() && slotEnd > e.start.getTime()
      )
    })
  } catch (err) {
    console.warn("[twilio-sms] Calendar check failed, showing all slots", err)
  }

  if (availableSlots.length === 0) {
    await sendFollowUp(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we don't have any availability on ${date}. Would you like to try a different day?`
    )
    return
  }

  // Format times for display
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const timeList = availableSlots
    .slice(0, 8)
    .map((iso) => formatter.format(new Date(iso)))
    .join(", ")

  const moreText =
    availableSlots.length > 8
      ? ` (and ${availableSlots.length - 8} more)`
      : ""

  await sendFollowUp(
    conversationId,
    customerPhone,
    agentPhone,
    `Available times on ${date}: ${timeList}${moreText}. Which works best for you?`
  )
}

async function handleBook(
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig
): Promise<void> {
  const { date, time, patientName, service } = actionData
  if (!date || !time || !patientName || !service) return

  const timezone = config.timezone ?? "America/New_York"

  // Parse the scheduled time
  const scheduledAt = new Date(`${date}T${time}`)
  if (isNaN(scheduledAt.getTime())) {
    console.error("[twilio-sms] Invalid booking datetime", { date, time })
    return
  }

  // Create appointment record
  const appointment = await prisma.appointment.create({
    data: {
      agentId: agent.id,
      patientName,
      patientPhone: customerPhone,
      scheduledAt,
      service,
      status: AppointmentStatus.BOOKED,
    },
  })

  // Try Google Calendar sync (non-fatal)
  try {
    const defaultDuration =
      config.services?.find(
        (s) => s.name.toLowerCase() === service.toLowerCase()
      )?.duration ?? 30

    const { eventId } = await bookAppointment(agent.userId, {
      patientName,
      patientPhone: customerPhone,
      scheduledAt: scheduledAt.toISOString(),
      service,
      durationMinutes: defaultDuration,
    })

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { calendarEventId: eventId },
    })
  } catch (err) {
    console.warn("[twilio-sms] Google Calendar sync failed (non-fatal)", err)
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  await sendFollowUp(
    conversationId,
    customerPhone,
    agentPhone,
    `Your ${service} appointment is confirmed for ${formatter.format(scheduledAt)}. See you then!`
  )
}

async function handleCancel(
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string
): Promise<void> {
  // Find the first upcoming BOOKED appointment for this customer + agent
  const appointment = await prisma.appointment.findFirst({
    where: {
      agentId: agent.id,
      patientPhone: customerPhone,
      status: AppointmentStatus.BOOKED,
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
  })

  if (!appointment) {
    await sendFollowUp(
      conversationId,
      customerPhone,
      agentPhone,
      "We couldn't find an upcoming appointment to cancel. Please call us if you need further assistance."
    )
    return
  }

  // Update status to CANCELLED
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  })

  // Delete calendar event if exists (non-fatal)
  if (appointment.calendarEventId) {
    try {
      await deleteCalendarEvent(agent.userId, appointment.calendarEventId)
    } catch (err) {
      console.warn("[twilio-sms] Calendar event deletion failed (non-fatal)", err)
    }
  }

  await sendFollowUp(
    conversationId,
    customerPhone,
    agentPhone,
    "Your appointment has been cancelled. Let us know if you'd like to reschedule."
  )
}
