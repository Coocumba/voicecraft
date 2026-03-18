// Webhook called by the LiveKit voice agent to book an appointment.
// Authentication is via VOICECRAFT_API_KEY header — no user session.
//
// Always creates the Appointment record in the DB.
// If the agent's owner has a calendar integration connected, also creates a
// calendar event and stores the event ID on the appointment record.

import { prisma } from "@voicecraft/db"
import { bookAppointment, hasCalendarIntegration } from "@/lib/calendar"
import { withCors, preflightResponse } from "@/lib/cors"

export function OPTIONS(): Response {
  return preflightResponse()
}

export async function POST(request: Request): Promise<Response> {
  const corsHeaders = withCors()

  const apiKey = request.headers.get("x-api-key")
  if (apiKey !== process.env.VOICECRAFT_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400, headers: corsHeaders })
  }

  const { agentId, callId, patientName, patientPhone, scheduledAt, service } =
    body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400, headers: corsHeaders })
  }
  if (typeof patientName !== "string" || patientName.trim() === "") {
    return Response.json({ error: "patientName is required" }, { status: 400, headers: corsHeaders })
  }
  if (typeof scheduledAt !== "string" || scheduledAt.trim() === "") {
    return Response.json({ error: "scheduledAt is required (ISO 8601 datetime)" }, { status: 400, headers: corsHeaders })
  }
  if (typeof service !== "string" || service.trim() === "") {
    return Response.json({ error: "service is required" }, { status: 400, headers: corsHeaders })
  }

  const scheduledDate = new Date(scheduledAt)
  if (isNaN(scheduledDate.getTime())) {
    return Response.json({ error: "scheduledAt must be a valid ISO 8601 datetime" }, { status: 400, headers: corsHeaders })
  }
  if (scheduledDate < new Date()) {
    return Response.json({ error: "scheduledAt must be in the future" }, { status: 400, headers: corsHeaders })
  }

  try {
    // Verify the agent exists before creating the appointment.
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404, headers: corsHeaders })
    }

    // If a callId is provided, verify it belongs to this agent.
    if (callId !== undefined) {
      if (typeof callId !== "string") {
        return Response.json({ error: "callId must be a string" }, { status: 400, headers: corsHeaders })
      }
      const call = await prisma.call.findUnique({ where: { id: callId } })
      if (!call) {
        return Response.json({ error: "Call not found" }, { status: 404, headers: corsHeaders })
      }
      if (call.agentId !== agentId) {
        return Response.json({ error: "Call does not belong to this agent" }, { status: 400, headers: corsHeaders })
      }
    }

    // Attempt to create a calendar event if the user has a live integration.
    let calendarEventId: string | undefined
    try {
      const hasCalendar = await hasCalendarIntegration(agent.userId)

      if (hasCalendar) {
        const result = await bookAppointment(agent.userId, {
          patientName: patientName.trim(),
          patientPhone: typeof patientPhone === "string" ? patientPhone.trim() : undefined,
          scheduledAt: scheduledDate.toISOString(),
          service: service.trim(),
        })
        calendarEventId = result?.eventId
      }
    } catch (err) {
      // Non-fatal: the appointment will still be created in the DB without a
      // calendar event ID.  The user can reconnect their calendar later.
      console.warn("[book] Calendar event creation failed", {
        err,
        userId: agent.userId,
        scheduledAt,
      })
    }

    const appointment = await prisma.appointment.create({
      data: {
        agentId: agentId.trim(),
        callId: typeof callId === "string" ? callId : undefined,
        patientName: patientName.trim(),
        patientPhone: typeof patientPhone === "string" ? patientPhone.trim() : undefined,
        scheduledAt: scheduledDate,
        service: service.trim(),
        calendarEventId,
      },
    })

    return Response.json({ appointment }, { status: 201, headers: corsHeaders })
  } catch (err) {
    console.error("[POST /api/webhooks/book]", err)
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}
