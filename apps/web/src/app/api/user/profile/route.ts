import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

export async function PATCH(request: Request) {
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

  const { name } = body as Record<string, unknown>

  if (typeof name !== "string" || name.trim() === "") {
    return Response.json({ error: "name is required and must be a non-empty string" }, { status: 400 })
  }

  const trimmed = name.trim()
  if (trimmed.length < 2) {
    return Response.json({ error: "Name must be at least 2 characters" }, { status: 400 })
  }
  if (trimmed.length > 100) {
    return Response.json({ error: "Name must be under 100 characters" }, { status: 400 })
  }

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { name: name.trim() },
    })

    return Response.json({ user: { id: updated.id, name: updated.name, email: updated.email } })
  } catch (err) {
    console.error("[PATCH /api/user/profile]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
