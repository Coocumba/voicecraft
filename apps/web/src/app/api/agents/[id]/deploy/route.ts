import { auth } from "@/auth"
import { prisma, AgentStatus } from "@voicecraft/db"
import { SipClient } from "livekit-server-sdk"
import { configureNumberVoiceWebhook, canProvisionNumbers } from "@/lib/twilio"

interface RouteContext {
  params: Promise<{ id: string }>
}

async function createLiveKitDispatch(
  agentId: string,
  phoneNumber: string | null,
  phoneNumberSid: string | null
): Promise<string | null> {
  const livekitUrl = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const sipUsername = process.env.LIVEKIT_SIP_USERNAME
  const sipPassword = process.env.LIVEKIT_SIP_PASSWORD

  if (!livekitUrl || !apiKey || !apiSecret) {
    console.warn("[deploy] LiveKit env vars not configured — skipping dispatch rule creation")
    return null
  }

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // Create an inbound SIP trunk for the phone number
  let trunkId: string | undefined
  if (phoneNumber) {
    try {
      const trunk = await sipClient.createSipInboundTrunk(
        `VoiceCraft agent ${agentId}`,
        [phoneNumber],
        {
          krispEnabled: true,
          ...(sipUsername && sipPassword
            ? { authUsername: sipUsername, authPassword: sipPassword }
            : {}),
        }
      )
      trunkId = trunk.sipTrunkId
      console.info("[deploy] SIP inbound trunk created", { trunkId, phoneNumber })
    } catch (err) {
      console.error("[deploy] Failed to create SIP inbound trunk", err)
    }

    // Point the Twilio number at our voice webhook so inbound calls reach us
    if (phoneNumberSid && canProvisionNumbers()) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (appUrl && !appUrl.includes("localhost")) {
        try {
          await configureNumberVoiceWebhook(phoneNumberSid, `${appUrl}/api/webhooks/twilio-voice`)
          console.info("[deploy] Twilio number voice webhook configured", { phoneNumber })
        } catch (err) {
          console.error("[deploy] Failed to configure Twilio number voice webhook", err)
        }
      }
    }
  }

  // Create a dispatch rule that routes inbound calls to a new room per caller.
  // The agent ID is passed as metadata so the worker can load the right config.
  // Link to the specific trunk so LiveKit knows which calls to route here.
  try {
    const rule = await sipClient.createSipDispatchRule(
      {
        type: "individual",
        roomPrefix: `voicecraft-${agentId}-`,
      },
      {
        name: `VoiceCraft agent ${agentId}`,
        metadata: agentId,
        ...(trunkId ? { trunkIds: [trunkId] } : {}),
      }
    )
    const dispatchId = rule.sipDispatchRuleId ?? null
    console.info("[deploy] SIP dispatch rule created", { dispatchId })
    return dispatchId
  } catch (err) {
    console.error("[deploy] Failed to create SIP dispatch rule", err)
    return null
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const existing = await prisma.agent.findUnique({ where: { id } })

    if (!existing) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (existing.status === AgentStatus.ACTIVE) {
      return Response.json({ error: "Agent is already deployed" }, { status: 409 })
    }
    if (!existing.phoneNumber) {
      return Response.json({ error: "Assign a phone number before deploying" }, { status: 422 })
    }

    const dispatchId = await createLiveKitDispatch(id, existing.phoneNumber, existing.phoneNumberSid)

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        status: AgentStatus.ACTIVE,
        ...(dispatchId ? { liveKitDispatchId: dispatchId } : {}),
      },
    })

    return Response.json({ agent })
  } catch (err) {
    console.error("[POST /api/agents/:id/deploy]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
