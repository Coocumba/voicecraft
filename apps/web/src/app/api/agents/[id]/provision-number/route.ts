import { auth } from "@/auth"
import { prisma, AgentStatus, PhoneNumberStatus } from "@voicecraft/db"
import { canProvisionNumbers, purchaseSpecificNumber, configureNumberVoiceWebhook } from "@/lib/twilio"
import { acquireNumber, releaseNumber, extractAreaCode } from "@/lib/phone-pool"
import { SipClient } from "livekit-server-sdk"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Provision a phone number for this agent (from pool or Twilio).
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

    // Parse optional body params
    let areaCode: string | undefined
    let poolNumberId: string | undefined
    let phoneNumber: string | undefined
    try {
      const body = (await request.json()) as { areaCode?: string; poolNumberId?: string; phoneNumber?: string }
      if (typeof body.areaCode === "string" && /^\d{3}$/.test(body.areaCode)) {
        areaCode = body.areaCode
      }
      if (typeof body.poolNumberId === "string") {
        poolNumberId = body.poolNumberId
      }
      if (typeof body.phoneNumber === "string" && body.phoneNumber.startsWith("+")) {
        phoneNumber = body.phoneNumber
      }
    } catch {
      // No body or invalid JSON — that's fine, all are optional
    }

    // If user selected a specific Twilio number from search results, purchase it directly
    if (phoneNumber) {
      const purchased = await purchaseSpecificNumber(phoneNumber)

      // Create pool record as ASSIGNED
      await prisma.phoneNumber.create({
        data: {
          number: purchased.phoneNumber,
          twilioSid: purchased.sid,
          areaCode: extractAreaCode(purchased.phoneNumber),
          status: PhoneNumberStatus.ASSIGNED,
          agentId: id,
          userId: session.user.id,
          assignedAt: new Date(),
        },
      })

      // Configure voice webhook if in production
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (appUrl && !appUrl.includes("localhost")) {
        await configureNumberVoiceWebhook(purchased.sid, `${appUrl}/api/webhooks/twilio-voice`)
      }

      const updated = await prisma.agent.update({
        where: { id },
        data: {
          phoneNumber: purchased.phoneNumber,
          phoneNumberSid: purchased.sid,
          phoneNumberSource: "provisioned",
        },
      })

      return Response.json({ agent: updated, fromPool: false }, { status: 201 })
    }

    // If user explicitly selected a specific pool number, claim it directly.
    // Do NOT fall through to acquireNumber — the user chose this exact number,
    // so if it's gone we should fail rather than silently assign a different one.
    if (poolNumberId) {
      const userId = session.user.id
      const claimed = await prisma.$transaction(async (tx) => {
        const { count } = await tx.phoneNumber.updateMany({
          where: {
            id: poolNumberId,
            status: PhoneNumberStatus.AVAILABLE,
          },
          data: {
            status: PhoneNumberStatus.ASSIGNED,
            agentId: id,
            userId,
            assignedAt: new Date(),
            releasedAt: null,
          },
        })
        if (count === 0) return null
        return tx.phoneNumber.findUnique({ where: { id: poolNumberId } })
      })

      if (!claimed) {
        return Response.json(
          { error: "This number was just claimed. Please pick another." },
          { status: 409 }
        )
      }

      // Configure voice webhook if in production
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (appUrl && !appUrl.includes("localhost")) {
        await configureNumberVoiceWebhook(claimed.twilioSid, `${appUrl}/api/webhooks/twilio-voice`)
      }

      const updated = await prisma.agent.update({
        where: { id },
        data: {
          phoneNumber: claimed.number,
          phoneNumberSid: claimed.twilioSid,
          phoneNumberSource: "provisioned",
        },
      })

      return Response.json({ agent: updated, fromPool: true }, { status: 201 })
    }

    // Quick provision: no specific number chosen, use pool-first then Twilio fallback
    const result = await acquireNumber(id, session.user.id, areaCode)

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        phoneNumber: result.phoneNumber,
        phoneNumberSid: result.sid,
        phoneNumberSource: "provisioned",
      },
    })

    return Response.json({ agent: updated, fromPool: result.fromPool }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/agents/:id/provision-number]", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE — Release a phone number from this agent (soft-release to pool).
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

    // Soft-release provisioned numbers back to pool (no Twilio call)
    if (agent.phoneNumberSource === "provisioned" && agent.phoneNumberSid) {
      await releaseNumber(id)
      console.info("[provision-number] Soft-released number to pool", { sid: agent.phoneNumberSid })
    }

    // Clean up LiveKit resources if agent was active
    if (agent.status === AgentStatus.ACTIVE && (agent.liveKitDispatchId || agent.liveKitTrunkId)) {
      const livekitUrl = process.env.LIVEKIT_URL
      const apiKey = process.env.LIVEKIT_API_KEY
      const apiSecret = process.env.LIVEKIT_API_SECRET
      if (livekitUrl && apiKey && apiSecret) {
        const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)
        if (agent.liveKitDispatchId) {
          try {
            await sipClient.deleteSipDispatchRule(agent.liveKitDispatchId)
          } catch (err) {
            console.error("[provision-number] Failed to delete dispatch rule", err)
          }
        }
        if (agent.liveKitTrunkId) {
          try {
            await sipClient.deleteSipTrunk(agent.liveKitTrunkId)
          } catch (err) {
            console.error("[provision-number] Failed to delete SIP trunk", err)
          }
        }
      }
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        phoneNumber: null,
        phoneNumberSid: null,
        phoneNumberSource: null,
        liveKitTrunkId: null,
        liveKitDispatchId: null,
        smsEnabled: false,
        ...(agent.status === AgentStatus.ACTIVE ? { status: AgentStatus.INACTIVE } : {}),
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[DELETE /api/agents/:id/provision-number]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
