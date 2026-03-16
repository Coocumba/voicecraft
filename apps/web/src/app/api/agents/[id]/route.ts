import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { SipClient } from "livekit-server-sdk"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  // Support both session auth (dashboard) and API key auth (agent worker)
  const apiKey = request.headers.get("x-api-key")
  const isApiKeyAuth = apiKey === process.env.VOICECRAFT_API_KEY && !!apiKey

  const session = await auth()

  if (!session?.user?.id && !isApiKeyAuth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    // Only enforce ownership check for session-based auth
    if (!isApiKeyAuth && agent.userId !== session?.user?.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    return Response.json({ agent })
  } catch (err) {
    console.error("[GET /api/agents/:id]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  try {
    const existing = await prisma.agent.findUnique({ where: { id } })

    if (!existing) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    const { name, businessName, config, voiceSettings, phoneNumber, phoneNumberSource, status } = body as Record<string, unknown>

    const VALID_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"]
    const VALID_PHONE_SOURCES = ["manual", "provisioned"]
    const updateData: Record<string, unknown> = {}
    if (typeof name === "string" && name.trim() !== "") updateData.name = name.trim()
    if (typeof businessName === "string" && businessName.trim() !== "") updateData.businessName = businessName.trim()
    if (config !== undefined) updateData.config = config
    if (voiceSettings !== undefined) updateData.voiceSettings = voiceSettings
    if (typeof phoneNumber === "string") updateData.phoneNumber = phoneNumber
    if (typeof phoneNumberSource === "string" && VALID_PHONE_SOURCES.includes(phoneNumberSource)) {
      updateData.phoneNumberSource = phoneNumberSource
      // Clear provisioning metadata when switching to manual
      if (phoneNumberSource === "manual") {
        updateData.phoneNumberSid = null
      }
    }
    if (typeof status === "string" && VALID_STATUSES.includes(status)) updateData.status = status

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 })
    }

    // Clean up LiveKit dispatch rule when deactivating
    if (updateData.status === "INACTIVE" && existing.liveKitDispatchId) {
      const livekitUrl = process.env.LIVEKIT_URL
      const apiKey = process.env.LIVEKIT_API_KEY
      const apiSecret = process.env.LIVEKIT_API_SECRET
      if (livekitUrl && apiKey && apiSecret) {
        try {
          const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)
          await sipClient.deleteSipDispatchRule(existing.liveKitDispatchId)
          updateData.liveKitDispatchId = null
          console.info("[PUT /api/agents/:id] Deleted dispatch rule", { dispatchId: existing.liveKitDispatchId })
        } catch (err) {
          console.error("[PUT /api/agents/:id] Failed to delete dispatch rule", err)
        }
      }
    }

    const agent = await prisma.agent.update({ where: { id }, data: updateData })

    return Response.json({ agent })
  } catch (err) {
    console.error("[PUT /api/agents/:id]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
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

    await prisma.agent.delete({ where: { id } })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error("[DELETE /api/agents/:id]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
