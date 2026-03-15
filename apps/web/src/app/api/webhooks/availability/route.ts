// Webhook called by the LiveKit voice agent to check available appointment slots.
// Authentication is via VOICECRAFT_API_KEY header — no user session.
//
// Uses Google Calendar when the agent's owner has connected their calendar;
// falls back to deterministic mock slots otherwise.

import { prisma, IntegrationProvider } from "@voicecraft/db"
import { checkAvailability } from "@/lib/google-calendar"
import { withCors, preflightResponse } from "@/lib/cors"

export function OPTIONS(): Response {
  return preflightResponse()
}

interface TimeSlot {
  time: string   // ISO 8601 datetime string
  available: boolean
}

function generateMockSlots(dateStr: string): TimeSlot[] {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return []

  const slots: TimeSlot[] = []
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()

  // Generate 30-minute slots from 09:00 to 17:00 (last slot starts at 16:30).
  for (let hour = 9; hour < 17; hour++) {
    for (const minute of [0, 30]) {
      const slotDate = new Date(year, month, day, hour, minute, 0, 0)

      // Deterministically mark ~25% of slots as unavailable using a simple hash
      // so the mock data is consistent for a given date+time combination.
      const seed = slotDate.getTime() / 60000
      const available = seed % 4 !== 0

      slots.push({
        time: slotDate.toISOString(),
        available,
      })
    }
  }

  return slots
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

  const { agentId, date, service } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400, headers: corsHeaders })
  }
  if (typeof date !== "string" || date.trim() === "") {
    return Response.json({ error: "date is required (ISO 8601 date string)" }, { status: 400, headers: corsHeaders })
  }
  if (typeof service !== "string" || service.trim() === "") {
    return Response.json({ error: "service is required" }, { status: 400, headers: corsHeaders })
  }

  // Look up the agent to get the owner's userId.
  let userId: string | null = null
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId.trim() },
      select: { userId: true },
    })
    if (agent) userId = agent.userId
  } catch (err) {
    console.error("[availability] Failed to look up agent", { err, agentId })
  }

  // Attempt Google Calendar availability check if the user has a live integration.
  if (userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_provider: {
            userId,
            provider: IntegrationProvider.GOOGLE_CALENDAR,
          },
        },
        select: { id: true },
      })

      if (integration) {
        const slots = await checkAvailability(userId, date.trim(), service.trim())
        return Response.json({
          agentId: agentId.trim(),
          date: date.trim(),
          service: service.trim(),
          slots: slots.map((s) => s.time),
          source: "google_calendar",
        }, { headers: corsHeaders })
      }
    } catch (err) {
      // Non-fatal: log and fall through to mock slots so the call can continue.
      console.warn("[availability] Google Calendar check failed, falling back to mock", {
        err,
        userId,
        date,
      })
    }
  }

  // Fallback: deterministic mock slots.
  const mockSlots = generateMockSlots(date.trim())
  if (mockSlots.length === 0) {
    return Response.json({ error: "Invalid date format" }, { status: 400, headers: corsHeaders })
  }

  const slots = mockSlots.filter((s) => s.available).map((s) => s.time)

  return Response.json({
    agentId: agentId.trim(),
    date: date.trim(),
    service: service.trim(),
    slots,
    source: "mock",
  }, { headers: corsHeaders })
}
