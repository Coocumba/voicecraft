import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { configureNumberSmsWebhook } from "@/lib/twilio"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Enable SMS on an agent.
 *
 * Configures the Twilio number's SMS webhook so inbound texts
 * are routed to our /api/webhooks/twilio-sms handler.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    if (agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!agent.phoneNumber || !agent.phoneNumberSid) {
      return Response.json(
        { error: "Agent must have a provisioned phone number to enable SMS" },
        { status: 400 }
      )
    }
    if (agent.smsEnabled) {
      return Response.json({ error: "SMS is already enabled" }, { status: 409 })
    }

    // Configure Twilio SMS webhook (skip on localhost)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost")) {
      await configureNumberSmsWebhook(
        agent.phoneNumberSid,
        `${appUrl}/api/webhooks/twilio-sms`
      )
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: { smsEnabled: true },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[POST /api/agents/:id/sms]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE — Disable SMS on an agent.
 *
 * Clears the Twilio number's SMS webhook so inbound texts
 * are no longer routed to our handler.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    if (agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!agent.smsEnabled) {
      return Response.json({ error: "SMS is not enabled" }, { status: 409 })
    }

    // Clear Twilio SMS webhook (skip on localhost)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost") && agent.phoneNumberSid) {
      await configureNumberSmsWebhook(agent.phoneNumberSid, null)
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: { smsEnabled: false },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[DELETE /api/agents/:id/sms]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
