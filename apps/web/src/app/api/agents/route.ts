import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const agents = await prisma.agent.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ agents })
  } catch (err) {
    console.error("[GET /api/agents]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
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

  const { name, businessName, config, voiceSettings } = body as Record<string, unknown>

  if (typeof name !== "string" || name.trim() === "") {
    return Response.json({ error: "name is required and must be a non-empty string" }, { status: 400 })
  }
  if (typeof businessName !== "string" || businessName.trim() === "") {
    return Response.json({ error: "businessName is required and must be a non-empty string" }, { status: 400 })
  }
  if (config === undefined || config === null) {
    return Response.json({ error: "config is required" }, { status: 400 })
  }

  try {
    const configJson = config as Parameters<typeof prisma.agent.create>[0]["data"]["config"]
    const agent = await prisma.agent.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        businessName: businessName.trim(),
        config: configJson,
        ...(voiceSettings !== undefined && voiceSettings !== null
          ? { voiceSettings: voiceSettings as Parameters<typeof prisma.agent.create>[0]["data"]["voiceSettings"] }
          : {}),
      },
    })

    return Response.json({ agent }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/agents]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
