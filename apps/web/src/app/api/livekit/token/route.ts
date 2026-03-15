import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { AccessToken, RoomServiceClient } from "livekit-server-sdk"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const livekitUrl = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!livekitUrl || !apiKey || !apiSecret) {
    console.error("[POST /api/livekit/token] LiveKit environment variables are not configured")
    return Response.json({ error: "LiveKit is not configured" }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { agentId } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400 })
  }

  try {
    // Verify the agent exists and belongs to the authenticated user
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }
    if (agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Room name must match the dispatch rule prefix so the worker auto-joins
    const roomName = `voicecraft-${agentId}-${Date.now()}`
    const participantIdentity = `user-${session.user.id}`

    // Create the room with agent ID as metadata so the worker can load config
    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)
    await roomService.createRoom({
      name: roomName,
      metadata: agentId,
    })

    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: 3600,
    })

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    })

    const jwt = await token.toJwt()

    return Response.json({
      token: jwt,
      roomName,
      participantIdentity,
      livekitUrl,
    })
  } catch (err) {
    console.error("[POST /api/livekit/token]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
