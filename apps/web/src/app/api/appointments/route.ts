import { auth } from "@/auth"
import { prisma, AppointmentStatus } from "@voicecraft/db"
import type { Prisma } from "@voicecraft/db"

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  const agentId = searchParams.get("agentId") ?? undefined
  const statusParam = searchParams.get("status") ?? undefined
  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined
  const cursor = searchParams.get("cursor") ?? undefined
  const limitParam = searchParams.get("limit")

  const limit = Math.min(
    limitParam ? Math.max(1, parseInt(limitParam, 10)) : DEFAULT_LIMIT,
    MAX_LIMIT
  )

  if (isNaN(limit)) {
    return Response.json({ error: "limit must be a number" }, { status: 400 })
  }

  // Validate status if provided
  const VALID_STATUSES: string[] = [
    AppointmentStatus.BOOKED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
  ]
  if (statusParam !== undefined && !VALID_STATUSES.includes(statusParam)) {
    return Response.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate date params
  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(to) : undefined

  if (fromDate && isNaN(fromDate.getTime())) {
    return Response.json({ error: "from must be a valid ISO date" }, { status: 400 })
  }
  if (toDate && isNaN(toDate.getTime())) {
    return Response.json({ error: "to must be a valid ISO date" }, { status: 400 })
  }

  try {
    // Scope to agents owned by the current user
    const userAgentIds = await prisma.agent
      .findMany({
        where: {
          userId: session.user.id,
          ...(agentId ? { id: agentId } : {}),
        },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id))

    if (agentId && !userAgentIds.includes(agentId)) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }

    const where: Prisma.AppointmentWhereInput = {
      agentId: { in: userAgentIds },
      ...(statusParam ? { status: statusParam as AppointmentStatus } : {}),
      ...(fromDate || toDate
        ? {
            scheduledAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    }

    // Fetch appointments + 1 to determine if there's a next page
    const [appointments, stats] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { scheduledAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          agent: { select: { id: true, name: true, businessName: true } },
        },
      }),
      // Summary stats are always across ALL appointments for the user (no date/status filter)
      prisma.appointment.aggregate({
        where: { agentId: { in: userAgentIds } },
        _count: { id: true },
      }),
    ])

    const hasNextPage = appointments.length > limit
    const page = hasNextPage ? appointments.slice(0, limit) : appointments
    const nextCursor = hasNextPage ? page[page.length - 1]?.id : null

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const [todayCount, upcomingCount] = await Promise.all([
      prisma.appointment.count({
        where: {
          agentId: { in: userAgentIds },
          scheduledAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          agentId: { in: userAgentIds },
          status: AppointmentStatus.BOOKED,
          scheduledAt: { gt: now },
        },
      }),
    ])

    return Response.json({
      appointments: page,
      nextCursor,
      stats: {
        today: todayCount,
        upcoming: upcomingCount,
        total: stats._count.id,
      },
    })
  } catch (err) {
    console.error("[GET /api/appointments]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
