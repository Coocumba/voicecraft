// Google Calendar integration utilities.
// Uses google-auth-library for token management and the Google Calendar REST API
// via plain fetch to avoid bundling the full googleapis SDK.

import { prisma, IntegrationProvider } from "@voicecraft/db"

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface GoogleCalendarEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  status?: string
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[]
  nextPageToken?: string
}

interface GoogleCreatedEvent {
  id: string
  htmlLink: string
}

export interface AvailableSlot {
  time: string   // ISO 8601 datetime
  endTime: string
}

export interface BookingDetails {
  patientName: string
  patientPhone?: string
  scheduledAt: string  // ISO 8601 datetime
  service: string
  durationMinutes?: number
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Exchange a refresh token for a fresh access token using Google's token
 * endpoint.  Returns the updated token payload and persists it to the DB.
 */
async function refreshAccessToken(integrationId: string, refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token refresh failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as GoogleTokenResponse

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: data.access_token,
      // Google only returns a new refresh_token on the first authorization;
      // keep the existing one if the response omits it.
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt,
    },
  })

  return data.access_token
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a valid access token for the given user's Google Calendar integration.
 * Refreshes the token automatically when it is within 5 minutes of expiry.
 *
 * Throws if no integration exists or the token cannot be refreshed.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.GOOGLE_CALENDAR } },
  })

  if (!integration) {
    throw new Error(`No Google Calendar integration found for user ${userId}`)
  }

  // Consider the token expired 5 minutes early to account for clock skew.
  const bufferMs = 5 * 60 * 1000
  const isExpired =
    integration.expiresAt !== null &&
    integration.expiresAt.getTime() - bufferMs < Date.now()

  if (!isExpired) {
    return integration.accessToken
  }

  if (!integration.refreshToken) {
    throw new Error("Google Calendar token is expired and no refresh token is available")
  }

  return refreshAccessToken(integration.id, integration.refreshToken)
}

/**
 * List calendar events for a given day.
 *
 * @param accessToken  Valid Google OAuth access token.
 * @param dateStr      ISO 8601 date (YYYY-MM-DD).  Time zone assumed to be UTC.
 */
async function listEventsForDate(
  accessToken: string,
  dateStr: string
): Promise<GoogleCalendarEvent[]> {
  const dayStart = new Date(`${dateStr}T00:00:00Z`)
  const dayEnd = new Date(`${dateStr}T23:59:59Z`)

  if (isNaN(dayStart.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }

  const params = new URLSearchParams({
    calendarId: "primary",
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar events fetch failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as GoogleEventsListResponse
  return data.items ?? []
}

/**
 * Check availability for a given date by fetching existing calendar events and
 * computing free 30-minute slots between 09:00 and 17:00 UTC.
 */
export async function checkAvailability(
  userId: string,
  date: string,
  _service: string
): Promise<AvailableSlot[]> {
  const accessToken = await getValidAccessToken(userId)
  const events = await listEventsForDate(accessToken, date)

  // Build a list of busy intervals from existing events.
  const busyIntervals: Array<{ start: number; end: number }> = []
  for (const event of events) {
    if (event.status === "cancelled") continue
    const startStr = event.start.dateTime ?? event.start.date
    const endStr = event.end.dateTime ?? event.end.date
    if (!startStr || !endStr) continue
    const startMs = new Date(startStr).getTime()
    const endMs = new Date(endStr).getTime()
    if (!isNaN(startMs) && !isNaN(endMs)) {
      busyIntervals.push({ start: startMs, end: endMs })
    }
  }

  // Generate 30-minute candidate slots from 09:00 to 17:00 UTC.
  const slots: AvailableSlot[] = []
  const dateParts = date.split("-").map(Number)
  const year = dateParts[0] ?? 0
  const month = dateParts[1] ?? 1
  const day = dateParts[2] ?? 1

  for (let hour = 9; hour < 17; hour++) {
    for (const minute of [0, 30]) {
      const slotStart = Date.UTC(year, month - 1, day, hour, minute, 0)
      const slotEnd = slotStart + 30 * 60 * 1000

      const overlaps = busyIntervals.some(
        (busy) => slotStart < busy.end && slotEnd > busy.start
      )

      if (!overlaps) {
        slots.push({
          time: new Date(slotStart).toISOString(),
          endTime: new Date(slotEnd).toISOString(),
        })
      }
    }
  }

  return slots
}

/**
 * Create a Google Calendar event for an appointment and return the event ID.
 */
export async function bookAppointment(
  userId: string,
  appointment: BookingDetails
): Promise<{ eventId: string }> {
  const accessToken = await getValidAccessToken(userId)

  const durationMs = (appointment.durationMinutes ?? 30) * 60 * 1000
  const startTime = new Date(appointment.scheduledAt)
  const endTime = new Date(startTime.getTime() + durationMs)

  const descriptionParts = [`Service: ${appointment.service}`]
  if (appointment.patientPhone) {
    descriptionParts.push(`Patient phone: ${appointment.patientPhone}`)
  }

  const eventBody = {
    summary: `${appointment.service} — ${appointment.patientName}`,
    description: descriptionParts.join("\n"),
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
  }

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar event creation failed (${res.status}): ${text}`)
  }

  const created = (await res.json()) as GoogleCreatedEvent
  return { eventId: created.id }
}
