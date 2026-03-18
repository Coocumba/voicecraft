import { auth } from "@/auth"
import { prisma, AppointmentStatus } from "@voicecraft/db"
import { deleteCalendarEvent } from "@/lib/calendar"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
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

  const { status } = body as Record<string, unknown>

  if (status !== "CANCELLED") {
    return Response.json(
      { error: "Only CANCELLED is a valid status transition via this endpoint" },
      { status: 400 }
    )
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { agent: { select: { userId: true } } },
    })

    if (!appointment) {
      return Response.json({ error: "Appointment not found" }, { status: 404 })
    }

    if (appointment.agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      return Response.json(
        { error: "Only BOOKED appointments can be cancelled" },
        { status: 409 }
      )
    }

    // Delete calendar event if one exists and the user has the integration
    if (appointment.calendarEventId) {
      await deleteCalendarEvent(session.user.id, appointment.calendarEventId)
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: {
        agent: { select: { id: true, name: true, businessName: true } },
      },
    })

    return Response.json({ appointment: updated })
  } catch (err) {
    console.error("[PATCH /api/appointments/:id]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
