// Webhook called by the LiveKit voice agent to look up a contact by phone number
// before greeting the caller. Authentication is via VOICECRAFT_API_KEY header.

import { prisma, AppointmentStatus } from "@voicecraft/db"
import { withCors, preflightResponse } from "@/lib/cors"

export function OPTIONS(): Response {
  return preflightResponse()
}

interface AppointmentSummary {
  service: string
  scheduledAt: Date
  status: string
}

interface FoundContact {
  name: string | null
  callCount: number
  lastCalledAt: Date | null
}

interface AppointmentGroups {
  upcoming: AppointmentSummary[]
  past: AppointmentSummary[]
}

type ContactLookupResponse =
  | { found: true; contact: FoundContact; appointments: AppointmentGroups }
  | { found: false }

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

  const { agentId, phone } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400, headers: corsHeaders })
  }
  if (typeof phone !== "string" || phone.trim() === "") {
    return Response.json({ error: "phone is required" }, { status: 400, headers: corsHeaders })
  }

  const normalizedPhone = phone.trim()
  const normalizedAgentId = agentId.trim()

  try {
    // Look up the agent to get the owner's userId.
    const agent = await prisma.agent.findUnique({
      where: { id: normalizedAgentId },
      select: { userId: true },
    })

    if (!agent) {
      // Agent not found — return not-found rather than an error so the call can proceed.
      const response: ContactLookupResponse = { found: false }
      return Response.json(response, { headers: corsHeaders })
    }

    const contact = await prisma.contact.findUnique({
      where: {
        userId_phone: {
          userId: agent.userId,
          phone: normalizedPhone,
        },
      },
    })

    if (!contact) {
      const response: ContactLookupResponse = { found: false }
      return Response.json(response, { headers: corsHeaders })
    }

    // Fetch past and upcoming appointments in parallel for this phone number
    // across all of this user's agents.
    const now = new Date()

    const [pastAppointments, upcomingAppointments] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          patientPhone: normalizedPhone,
          agent: { userId: agent.userId },
          scheduledAt: { lt: now },
        },
        orderBy: { scheduledAt: "desc" },
        take: 3,
        select: { service: true, scheduledAt: true, status: true },
      }),
      prisma.appointment.findMany({
        where: {
          patientPhone: normalizedPhone,
          agent: { userId: agent.userId },
          scheduledAt: { gte: now },
          status: AppointmentStatus.BOOKED,
        },
        orderBy: { scheduledAt: "asc" },
        take: 2,
        select: { service: true, scheduledAt: true, status: true },
      }),
    ])

    const response: ContactLookupResponse = {
      found: true,
      contact: {
        name: contact.name,
        callCount: contact.callCount,
        lastCalledAt: contact.lastCalledAt,
      },
      appointments: {
        upcoming: upcomingAppointments,
        past: pastAppointments,
      },
    }

    return Response.json(response, { headers: corsHeaders })
  } catch (err) {
    console.error("[contact-lookup] Error looking up contact", { err, agentId: normalizedAgentId, phone: normalizedPhone })
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}
