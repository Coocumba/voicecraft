// Webhook called by the LiveKit voice agent to look up a contact by phone number
// before greeting the caller. Authentication is via VOICECRAFT_API_KEY header.

import { prisma } from "@voicecraft/db"
import { withCors, preflightResponse } from "@/lib/cors"

export function OPTIONS(): Response {
  return preflightResponse()
}

interface RecentAppointment {
  service: string
  scheduledAt: Date
  status: string
}

interface FoundContact {
  name: string | null
  callCount: number
  lastCalledAt: Date | null
  recentAppointments: RecentAppointment[]
}

type ContactLookupResponse =
  | { found: true; contact: FoundContact }
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

    // Fetch the 5 most recent appointments for this phone number across all of
    // this user's agents, ordered most-recent first.
    const appointments = await prisma.appointment.findMany({
      where: {
        patientPhone: normalizedPhone,
        agent: { userId: agent.userId },
      },
      orderBy: { scheduledAt: "desc" },
      take: 5,
      select: {
        service: true,
        scheduledAt: true,
        status: true,
      },
    })

    const response: ContactLookupResponse = {
      found: true,
      contact: {
        name: contact.name,
        callCount: contact.callCount,
        lastCalledAt: contact.lastCalledAt,
        recentAppointments: appointments.map((a) => ({
          service: a.service,
          scheduledAt: a.scheduledAt,
          status: a.status,
        })),
      },
    }

    return Response.json(response, { headers: corsHeaders })
  } catch (err) {
    console.error("[contact-lookup] Error looking up contact", { err, agentId: normalizedAgentId, phone: normalizedPhone })
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}
