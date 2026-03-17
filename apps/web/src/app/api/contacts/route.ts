// GET /api/contacts
// Session-authenticated. Returns paginated contacts for the current user.
// Supports search (name or phone) and cursor-based pagination.

import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

interface ContactRow {
  id: string
  phone: string
  name: string | null
  email: string | null
  notes: string | null
  callCount: number
  lastCalledAt: Date | null
  createdAt: Date
  updatedAt: Date
  appointmentCount: number
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search")?.trim() ?? ""
  const cursor = searchParams.get("cursor")?.trim() ?? null
  const limitParam = parseInt(searchParams.get("limit") ?? "20", 10)
  const limit = Math.min(Math.max(isNaN(limitParam) ? 20 : limitParam, 1), 100)

  const userId = session.user.id

  try {
    // Build the where clause.
    const where = {
      userId,
      ...(search.length > 0
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    }

    // Get total count for the header.
    const total = await prisma.contact.count({ where })

    // Fetch one extra to determine whether there is a next page.
    const rawContacts = await prisma.contact.findMany({
      where,
      orderBy: [
        { lastCalledAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = rawContacts.length > limit
    const pageContacts = hasMore ? rawContacts.slice(0, limit) : rawContacts
    const lastContact = pageContacts[pageContacts.length - 1]
    const nextCursor = hasMore && lastContact ? lastContact.id : null

    // Fetch appointment counts in a single query for all phones on this page.
    const phones = pageContacts
      .map((c) => c.phone)
      .filter((p): p is string => typeof p === "string" && p.length > 0)

    const appointmentCounts =
      phones.length > 0
        ? await prisma.appointment.groupBy({
            by: ["patientPhone"],
            where: {
              patientPhone: { in: phones },
              agent: { userId },
            },
            _count: { id: true },
          })
        : []

    const appointmentCountByPhone = new Map<string, number>(
      appointmentCounts.map((row) => [row.patientPhone ?? "", row._count.id])
    )

    const contacts: ContactRow[] = pageContacts.map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      email: c.email,
      notes: c.notes,
      callCount: c.callCount,
      lastCalledAt: c.lastCalledAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      appointmentCount: appointmentCountByPhone.get(c.phone) ?? 0,
    }))

    return Response.json({ contacts, nextCursor, total })
  } catch (err) {
    console.error("[GET /api/contacts]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
