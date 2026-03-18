// Shared action handlers for WhatsApp conversations.
// Handles check_availability, book, and cancel actions triggered by the AI response.

import {
  prisma,
  AppointmentStatus,
} from "@voicecraft/db"
import { getCalendarEventsForDate, bookAppointment, deleteCalendarEvent } from "@/lib/calendar"
import { getDayName } from "@/lib/timezone-utils"
import { generateSlots } from "@/lib/slot-generator"
import type { AgentConfig } from "@/lib/builder-types"

// The sendReply callback MUST both save the message to prisma.message AND send it.
// Any implementation of SendReply must write to prisma.message with
// direction: MessageDirection.OUTBOUND and sender: MessageSender.BOT BEFORE sending,
// otherwise action follow-up messages will not appear in the conversation thread.
type SendReply = (conversationId: string, to: string, from: string, body: string) => Promise<void>

export async function handleAction(
  action: "check_availability" | "book" | "cancel",
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  try {
    switch (action) {
      case "check_availability":
        await handleCheckAvailability(actionData, agent, conversationId, customerPhone, agentPhone, config, sendReply)
        break
      case "book":
        await handleBook(actionData, agent, conversationId, customerPhone, agentPhone, config, sendReply)
        break
      case "cancel":
        await handleCancel(agent, conversationId, customerPhone, agentPhone, sendReply)
        break
    }
  } catch (err) {
    console.error(`[messaging-actions] Action "${action}" failed`, err)
  }
}

async function handleCheckAvailability(
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  const date = actionData.date
  if (!date) return

  const timezone = config.timezone ?? "America/New_York"
  const dayName = getDayName(date, timezone)

  const dayHours = config.hours?.[dayName] ?? null
  if (!dayHours) {
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we're closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s. Please choose another day.`
    )
    return
  }

  const defaultDuration =
    config.services && config.services.length > 0 ? config.services[0]!.duration : 30
  const allSlots = generateSlots(date, dayHours.open, dayHours.close, defaultDuration, timezone)

  let availableSlots = allSlots
  try {
    const events = await getCalendarEventsForDate(agent.userId, date, timezone)
    availableSlots = allSlots.filter((slotIso) => {
      const slotStart = new Date(slotIso).getTime()
      const slotEnd = slotStart + defaultDuration * 60 * 1000
      return !events.some((e) => slotStart < e.end.getTime() && slotEnd > e.start.getTime())
    })
  } catch (err) {
    console.warn("[messaging-actions] Calendar check failed, showing all slots", err)
  }

  if (availableSlots.length === 0) {
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we don't have any availability on ${date}. Would you like to try a different day?`
    )
    return
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const timeList = availableSlots.slice(0, 8).map((iso) => formatter.format(new Date(iso))).join(", ")
  const moreText = availableSlots.length > 8 ? ` (and ${availableSlots.length - 8} more)` : ""

  await sendReply(
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
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  const { date, time, patientName, service } = actionData
  if (!date || !time || !patientName || !service) return

  const timezone = config.timezone ?? "America/New_York"
  const scheduledAt = new Date(`${date}T${time}`)
  if (isNaN(scheduledAt.getTime())) {
    console.error("[messaging-actions] Invalid booking datetime", { date, time })
    return
  }

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

  try {
    const defaultDuration =
      config.services?.find((s) => s.name.toLowerCase() === service.toLowerCase())?.duration ?? 30
    const result = await bookAppointment(agent.userId, {
      patientName,
      patientPhone: customerPhone,
      scheduledAt: scheduledAt.toISOString(),
      service,
      durationMinutes: defaultDuration,
    })
    if (result) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { calendarEventId: result.eventId },
      })
    }
  } catch (err) {
    console.warn("[messaging-actions] Calendar sync failed (non-fatal)", err)
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

  await sendReply(
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
  agentPhone: string,
  sendReply: SendReply
): Promise<void> {
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
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      "We couldn't find an upcoming appointment to cancel. Please call us if you need further assistance."
    )
    return
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  })

  if (appointment.calendarEventId) {
    try {
      await deleteCalendarEvent(agent.userId, appointment.calendarEventId)
    } catch (err) {
      console.warn("[messaging-actions] Calendar event deletion failed (non-fatal)", err)
    }
  }

  await sendReply(
    conversationId,
    customerPhone,
    agentPhone,
    "Your appointment has been cancelled. Let us know if you'd like to reschedule."
  )
}
