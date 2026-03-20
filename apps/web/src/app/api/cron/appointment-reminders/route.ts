import crypto from "crypto"
import { prisma, AppointmentStatus } from "@voicecraft/db"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"

/**
 * POST /api/cron/appointment-reminders
 *
 * Hourly cron job — sends WhatsApp reminder templates to customers
 * whose appointments are 23–25 hours away.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 *
 * Trigger options:
 *  - Vercel: add to vercel.json crons (set CRON_SECRET in Vercel project settings;
 *    Vercel automatically sends it as the Bearer token)
 *  - Self-hosted: call via cron-job.org or Docker scheduled command
 *    e.g. docker exec voicecraft-web curl -X POST http://localhost:3000/api/cron/appointment-reminders \
 *         -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const secret = process.env.CRON_SECRET ?? ""

  const tokenBuf = Buffer.from(token)
  const secretBuf = Buffer.from(secret)
  const isValid = secret.length > 0 &&
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf)
  if (!isValid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reminderSid = process.env.TWILIO_WA_REMINDER_SID
  if (!reminderSid) {
    console.error("[cron/reminders] TWILIO_WA_REMINDER_SID not configured")
    return Response.json({ error: "Reminder template not configured" }, { status: 503 })
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: AppointmentStatus.BOOKED,
      reminderSent: false,
      patientPhone: { not: null },
      agent: { whatsappEnabled: true },
    },
    include: {
      agent: {
        select: { phoneNumber: true, businessName: true, config: true },
      },
    },
  })

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  })

  // Send all reminders in parallel and collect outcomes.
  const results = await Promise.allSettled(
    appointments
      .filter((appt) => appt.patientPhone && appt.agent.phoneNumber)
      .map((appt) =>
        sendWhatsAppTemplate(
          appt.patientPhone!,
          appt.agent.phoneNumber!,
          reminderSid,
          [
            appt.patientName,                           // {{1}} customer name
            appt.service,                               // {{2}} service
            appt.agent.businessName,                    // {{3}} business name
            dateFormatter.format(appt.scheduledAt),     // {{4}} date (e.g. "Monday, April 7")
            timeFormatter.format(appt.scheduledAt),     // {{5}} time (e.g. "2:00 PM")
          ]
        ).then(() => ({ apptId: appt.id, ok: true as const }))
         .catch((err: unknown) => ({ apptId: appt.id, ok: false as const, err }))
      )
  )

  // Partition outcomes.
  const successIds: string[] = []
  const noWhatsAppIds: string[] = []
  let failed = 0

  for (const result of results) {
    // Promise.allSettled only rejects if the mapper itself throws synchronously,
    // which can't happen here — the inner .catch() converts all rejections.
    if (result.status === "rejected") continue

    const { apptId, ok } = result.value
    if (ok) {
      successIds.push(apptId)
    } else {
      failed++
      const { err } = result.value as { apptId: string; ok: false; err: unknown }
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("63016")) {
        // Patient not on WhatsApp — mark sent to suppress future retries.
        console.info("[cron/reminders] Patient not on WhatsApp, marking sent to stop retries", { apptId })
        noWhatsAppIds.push(apptId)
      } else {
        console.error("[cron/reminders] Failed to send reminder", { apptId, err })
        // Leave reminderSent = false so next hourly run retries.
      }
    }
  }

  // Batch-update all IDs that should be marked as sent (successes + no-WhatsApp).
  const markSentIds = [...successIds, ...noWhatsAppIds]
  if (markSentIds.length > 0) {
    await prisma.appointment.updateMany({
      where: { id: { in: markSentIds } },
      data: { reminderSent: true },
    })
  }

  const sent = successIds.length
  console.info("[cron/reminders] Done", { total: appointments.length, sent, failed })
  return Response.json({ total: appointments.length, sent, failed })
}
