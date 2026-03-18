import { prisma, WhatsAppStatus } from "@voicecraft/db"
import { validateTwilioSignature, configureNumberWhatsAppWebhook } from "@/lib/twilio"

/**
 * POST /api/webhooks/twilio-whatsapp-status
 *
 * Handles two event types from Twilio:
 * 1. WhatsApp sender approval/rejection — updates agent.whatsappStatus
 * 2. Customer opt-out (STOP) — sets conversation.optedOut = true
 *
 * All requests are validated with Twilio signature before processing.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = String(value) })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl ? `${appUrl}/api/webhooks/twilio-whatsapp-status` : request.url

  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-whatsapp-status] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  const eventType = params["EventType"] ?? ""
  const phoneNumber = params["PhoneNumber"] ?? params["To"] ?? null

  // ── Sender approval/rejection ──────────────────────────────────────────
  if (eventType === "onWhatsAppSenderRequestApproved" || params["SenderStatus"]) {
    const status = params["SenderStatus"] ?? (eventType.includes("Approved") ? "approved" : "failed")
    const isApproved = status === "approved"

    if (!phoneNumber) {
      console.warn("[twilio-whatsapp-status] No phone number in sender status event")
      return new Response("OK", { status: 200 })
    }

    const agent = await prisma.agent.findFirst({
      where: { whatsappRegisteredNumber: phoneNumber },
    })

    if (!agent) {
      console.warn("[twilio-whatsapp-status] No agent found for number", { phoneNumber })
      return new Response("OK", { status: 200 })
    }

    if (isApproved) {
      // Configure the WhatsApp inbound webhook on the Twilio number
      const appUrlForWebhook = process.env.NEXT_PUBLIC_APP_URL
      if (appUrlForWebhook && !appUrlForWebhook.includes("localhost") && agent.phoneNumberSid) {
        await configureNumberWhatsAppWebhook(
          agent.phoneNumberSid,
          `${appUrlForWebhook}/api/webhooks/twilio-whatsapp`
        )
      }

      await prisma.agent.update({
        where: { id: agent.id },
        data: { whatsappStatus: WhatsAppStatus.APPROVED, whatsappEnabled: true },
      })

      console.info("[twilio-whatsapp-status] WhatsApp approved", { agentId: agent.id, phoneNumber })
    } else {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { whatsappStatus: WhatsAppStatus.FAILED, whatsappEnabled: false },
      })

      console.warn("[twilio-whatsapp-status] WhatsApp rejected", { agentId: agent.id, phoneNumber, status })
    }

    return new Response("OK", { status: 200 })
  }

  // ── Customer opt-out ───────────────────────────────────────────────────
  const from = params["From"] ?? ""
  const to = params["To"] ?? ""
  const body = (params["Body"] ?? "").trim().toUpperCase()

  if (body === "STOP" || eventType === "STOP") {
    // Strip whatsapp: prefix
    const customerPhone = from.replace(/^whatsapp:/, "")
    const agentPhone = to.replace(/^whatsapp:/, "")

    if (customerPhone && agentPhone) {
      await prisma.conversation.updateMany({
        where: { customerPhone, agent: { phoneNumber: agentPhone } },
        data: { optedOut: true },
      })
      console.info("[twilio-whatsapp-status] Customer opted out", { customerPhone, agentPhone })
    }
  }

  return new Response("OK", { status: 200 })
}
