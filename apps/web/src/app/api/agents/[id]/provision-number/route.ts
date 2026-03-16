import { auth } from "@/auth"
import { prisma, AgentStatus } from "@voicecraft/db"
import { purchasePhoneNumber, releasePhoneNumber, canProvisionNumbers, configureNumberVoiceWebhook } from "@/lib/twilio"
import { SipClient } from "livekit-server-sdk"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Provision a Twilio phone number for this agent.
 */
export async function POST(request: Request, { params }: RouteContext) {
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
    if (agent.phoneNumber) {
      return Response.json({ error: "Agent already has a phone number" }, { status: 409 })
    }
    if (!canProvisionNumbers()) {
      return Response.json(
        { error: "Phone provisioning is not available — Twilio is not configured" },
        { status: 503 }
      )
    }

    // Parse optional area code from body
    let areaCode: string | undefined
    try {
      const body = (await request.json()) as { areaCode?: string }
      if (typeof body.areaCode === "string" && /^\d{3}$/.test(body.areaCode)) {
        areaCode = body.areaCode
      }
    } catch {
      // No body or invalid JSON — that's fine, area code is optional
    }

    const purchased = await purchasePhoneNumber(areaCode)

    // Point the number at our voice webhook immediately (skip in local dev — Twilio can't reach localhost)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost")) {
      try {
        await configureNumberVoiceWebhook(purchased.sid, `${appUrl}/api/webhooks/twilio-voice`)
        console.info("[provision-number] Voice webhook configured", { phoneNumber: purchased.phoneNumber })
      } catch (err) {
        console.error("[provision-number] Failed to configure voice webhook", err)
      }
    }

    try {
      const updated = await prisma.agent.update({
        where: { id },
        data: {
          phoneNumber: purchased.phoneNumber,
          phoneNumberSid: purchased.sid,
          phoneNumberSource: "provisioned",
        },
      })
      return Response.json({ agent: updated }, { status: 201 })
    } catch (dbErr) {
      // DB update failed after purchase — attempt to release the number
      console.error("[provision-number] DB update failed, releasing number", dbErr)
      try {
        await releasePhoneNumber(purchased.sid)
      } catch (releaseErr) {
        console.error("[provision-number] Failed to release number after DB error", releaseErr)
      }
      return Response.json({ error: "Failed to save phone number" }, { status: 500 })
    }
  } catch (err) {
    console.error("[POST /api/agents/:id/provision-number]", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE — Release a provisioned phone number from this agent.
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
    if (!agent.phoneNumber) {
      return Response.json({ error: "Agent has no phone number" }, { status: 400 })
    }

    // Release the Twilio number if it was provisioned
    if (agent.phoneNumberSource === "provisioned" && agent.phoneNumberSid) {
      try {
        await releasePhoneNumber(agent.phoneNumberSid)
        console.info("[provision-number] Released Twilio number", { sid: agent.phoneNumberSid })
      } catch (err) {
        console.error("[provision-number] Failed to release Twilio number", err)
      }
    }

    // Clean up LiveKit dispatch rule if agent was active
    if (agent.status === AgentStatus.ACTIVE && agent.liveKitDispatchId) {
      const livekitUrl = process.env.LIVEKIT_URL
      const apiKey = process.env.LIVEKIT_API_KEY
      const apiSecret = process.env.LIVEKIT_API_SECRET
      if (livekitUrl && apiKey && apiSecret) {
        try {
          const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)
          await sipClient.deleteSipDispatchRule(agent.liveKitDispatchId)
        } catch (err) {
          console.error("[provision-number] Failed to delete dispatch rule", err)
        }
      }
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        phoneNumber: null,
        phoneNumberSid: null,
        phoneNumberSource: null,
        liveKitDispatchId: null,
        ...(agent.status === AgentStatus.ACTIVE ? { status: AgentStatus.INACTIVE } : {}),
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[DELETE /api/agents/:id/provision-number]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
