import { auth } from "@/auth"
import { prisma, WhatsAppStatus, AgentStatus } from "@voicecraft/db"
import { configureNumberWhatsAppWebhook } from "@/lib/twilio"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Enable WhatsApp on an agent's provisioned number.
 *
 * Registers the number with Twilio's WhatsApp Sender API under VoiceCraft's
 * WAISV account. Sets whatsappStatus = PENDING until Meta approves.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (!agent.phoneNumber || !agent.phoneNumberSid) {
      return Response.json(
        { error: "Agent must have a provisioned phone number to enable WhatsApp" },
        { status: 400 }
      )
    }
    if (agent.status !== AgentStatus.ACTIVE) {
      return Response.json({ error: "Agent must be active to enable WhatsApp" }, { status: 400 })
    }
    if (agent.whatsappStatus === WhatsAppStatus.PENDING || agent.whatsappStatus === WhatsAppStatus.APPROVED) {
      return Response.json({ error: "WhatsApp is already enabled or pending" }, { status: 409 })
    }

    // Register with Twilio WhatsApp Sender API
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    if (!twilioSid || !twilioToken) {
      return Response.json({ error: "Twilio is not configured" }, { status: 503 })
    }

    const senderRes = await fetch("https://messaging.twilio.com/v1/WhatsApp/SenderRequests", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ PhoneNumber: agent.phoneNumber }).toString(),
    })

    if (!senderRes.ok) {
      const text = await senderRes.text()
      console.error("[whatsapp] Twilio sender registration failed", { status: senderRes.status, text })
      return Response.json({ error: "WhatsApp registration failed. Please try again." }, { status: 502 })
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        whatsappStatus: WhatsAppStatus.PENDING,
        whatsappRegisteredNumber: agent.phoneNumber,
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[POST /api/agents/:id/whatsapp]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE — Disable WhatsApp on an agent.
 *
 * Clears the WhatsApp webhook on the Twilio number and resets agent status.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (!agent.whatsappEnabled && agent.whatsappStatus === WhatsAppStatus.NONE) {
      return Response.json({ error: "WhatsApp is not enabled" }, { status: 409 })
    }

    // Clear WhatsApp webhook on Twilio number (skip on localhost)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost") && agent.phoneNumberSid) {
      await configureNumberWhatsAppWebhook(agent.phoneNumberSid, null)
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        whatsappEnabled: false,
        whatsappStatus: WhatsAppStatus.NONE,
        whatsappRegisteredNumber: null,
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[DELETE /api/agents/:id/whatsapp]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
