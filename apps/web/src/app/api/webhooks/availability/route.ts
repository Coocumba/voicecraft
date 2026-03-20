// Webhook called by the LiveKit voice agent to check available appointment slots.
// Authentication is via VOICECRAFT_API_KEY header — no user session.
//
// Uses the connected calendar provider when the agent's owner has connected one;
// falls back to deterministic mock slots otherwise.
//
// Respects the agent's configured timezone, business hours, and service duration.

import { prisma } from "@voicecraft/db"
import { getCalendarEventsForDate, getConnectedProvider } from "@/lib/calendar"
import { withCors, preflightResponse } from "@/lib/cors"
import { getDayName, isValidTimezone } from "@/lib/timezone-utils"
import { generateSlots } from "@/lib/slot-generator"
import type { AgentConfig, DayHours } from "@/lib/builder-types"

export function OPTIONS(): Response {
  return preflightResponse()
}

/**
 * Parse a date string that may be ISO 8601 ("2026-03-21"), a natural
 * description ("next Friday", "coming Monday", "tomorrow"), or a casual
 * format ("March 21", "3/21/2026"). Returns a YYYY-MM-DD string, or
 * null if unparseable.
 */
function parseFlexibleDate(input: string): string | null {
  const trimmed = input.trim().toLowerCase()

  // Try ISO / built-in parsing first
  const direct = new Date(input.trim())
  if (!isNaN(direct.getTime())) {
    return direct.toISOString().split("T")[0] ?? null
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let result: Date | null = null

  if (trimmed === "today") {
    result = today
  } else if (trimmed === "tomorrow") {
    result = new Date(today.getTime() + 86400000)
  } else {
    // "next <day>" / "coming <day>" / "this <day>" / bare day name
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const dayMatch = trimmed.match(/^(?:next|coming|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i)
    if (dayMatch && dayMatch[1]) {
      const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase())
      const currentDay = today.getDay()
      let daysAhead = targetDay - currentDay
      if (daysAhead <= 0) daysAhead += 7
      result = new Date(today.getTime() + daysAhead * 86400000)
    }

    // "in X days"
    if (!result) {
      const inDaysMatch = trimmed.match(/^in\s+(\d+)\s+days?$/i)
      if (inDaysMatch && inDaysMatch[1]) {
        result = new Date(today.getTime() + parseInt(inDaysMatch[1], 10) * 86400000)
      }
    }
  }

  if (!result) return null
  return result.toISOString().split("T")[0] ?? null
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

  const { agentId, date, service, timezone: bodyTimezone } = body as Record<string, unknown>

  if (typeof agentId !== "string" || agentId.trim() === "") {
    return Response.json({ error: "agentId is required" }, { status: 400, headers: corsHeaders })
  }
  if (typeof date !== "string" || date.trim() === "") {
    return Response.json({ error: "date is required (ISO 8601 date string)" }, { status: 400, headers: corsHeaders })
  }
  if (typeof service !== "string" || service.trim() === "") {
    return Response.json({ error: "service is required" }, { status: 400, headers: corsHeaders })
  }

  const agentIdStr = agentId.trim()
  const serviceStr = service.trim()

  // Parse flexible date input to YYYY-MM-DD
  const dateStr = parseFlexibleDate(date.trim())
  if (!dateStr) {
    return Response.json({ error: "Invalid date format" }, { status: 400, headers: corsHeaders })
  }

  // Fetch agent with config
  const agent = await prisma.agent.findUnique({
    where: { id: agentIdStr },
    select: { userId: true, config: true },
  })

  if (!agent) {
    return Response.json({ slots: [], source: "mock" }, { headers: corsHeaders })
  }

  const config = (typeof agent.config === "object" && agent.config !== null ? agent.config : {}) as AgentConfig

  // Resolve timezone: body > config > UTC
  let timezone = (typeof bodyTimezone === "string" ? bodyTimezone : undefined) ?? config.timezone ?? "UTC"
  if (!isValidTimezone(timezone)) {
    console.warn(`[availability] Invalid timezone "${timezone}", falling back to UTC`)
    timezone = "UTC"
  }

  // Check if the requested day is open
  const dayName = getDayName(dateStr, timezone)
  const dayHours: DayHours | null | undefined = config.hours?.[dayName]

  if (dayHours === null) {
    return Response.json({ slots: [], source: "mock", reason: "closed" }, { headers: corsHeaders })
  }

  const open = dayHours?.open ?? "09:00"
  const close = dayHours?.close ?? "17:00"

  // Find service duration from config
  const serviceConfig = config.services?.find(
    (s) => s.name.toLowerCase() === serviceStr.toLowerCase()
  )
  const durationMinutes = serviceConfig?.duration ?? 30

  // Generate candidate slots
  const allSlots = generateSlots(dateStr, open, close, durationMinutes, timezone)

  // Resolve the connected calendar provider (null when none is connected).
  // A single findFirst replaces the COUNT query previously used by hasCalendarIntegration.
  const calendarProvider = await getConnectedProvider(agent.userId)

  let availableSlots: string[]
  let source: "calendar" | "mock"

  if (calendarProvider !== null) {
    try {
      const events = await getCalendarEventsForDate(agent.userId, dateStr, timezone)
      // Filter out slots that overlap with any calendar event
      availableSlots = allSlots.filter((slotIso) => {
        const slotStart = new Date(slotIso).getTime()
        const slotEnd = slotStart + durationMinutes * 60_000
        return !events.some((ev) => ev.start.getTime() < slotEnd && ev.end.getTime() > slotStart)
      })
      source = "calendar"
    } catch (err) {
      console.error("[availability] Calendar error, falling back to mock", err)
      // Mock: deterministic filter (~25% unavailable)
      availableSlots = allSlots.filter((_, i) => (i + 1) % 4 !== 0)
      source = "mock"
    }
  } else {
    // Mock: deterministic filter (~25% unavailable)
    availableSlots = allSlots.filter((_, i) => (i + 1) % 4 !== 0)
    source = "mock"
  }

  return Response.json({ slots: availableSlots, source }, { headers: corsHeaders })
}
