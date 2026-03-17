// PATCH /api/contacts/[id]
// Session-authenticated. Allows the owner to update name, email, and notes.

import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

interface RouteContext {
  params: Promise<{ id: string }>
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
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

  const { name, email, notes } = body as Record<string, unknown>

  // Validate fields.
  if (name !== undefined) {
    if (typeof name !== "string") {
      return Response.json({ error: "name must be a string" }, { status: 400 })
    }
    if (name.trim().length > 200) {
      return Response.json({ error: "name must be 200 characters or fewer" }, { status: 400 })
    }
  }

  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string") {
      return Response.json({ error: "email must be a string" }, { status: 400 })
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return Response.json({ error: "email is not a valid email address" }, { status: 400 })
    }
  }

  if (notes !== undefined && notes !== null && notes !== "") {
    if (typeof notes !== "string") {
      return Response.json({ error: "notes must be a string" }, { status: 400 })
    }
    if (notes.length > 2000) {
      return Response.json({ error: "notes must be 2000 characters or fewer" }, { status: 400 })
    }
  }

  try {
    const existing = await prisma.contact.findUnique({ where: { id } })

    if (!existing) {
      return Response.json({ error: "Contact not found" }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    type ContactUpdateInput = {
      name?: string | null
      email?: string | null
      notes?: string | null
    }

    const updateData: ContactUpdateInput = {}

    if (name !== undefined) {
      updateData.name = typeof name === "string" && name.trim().length > 0 ? name.trim() : null
    }
    if (email !== undefined) {
      updateData.email =
        typeof email === "string" && email.trim().length > 0 ? email.trim() : null
    }
    if (notes !== undefined) {
      updateData.notes =
        typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const contact = await prisma.contact.update({ where: { id }, data: updateData })

    return Response.json({ contact })
  } catch (err) {
    console.error("[PATCH /api/contacts/:id]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
