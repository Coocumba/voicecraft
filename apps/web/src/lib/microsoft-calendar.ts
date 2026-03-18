import { prisma, IntegrationProvider } from "@voicecraft/db"
import { toUTC } from "@/lib/timezone-utils"
import type { BookingDetails } from "@/lib/calendar"

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface MicrosoftEvent {
  id: string
  subject?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  isCancelled?: boolean
}

interface MicrosoftEventsResponse {
  value?: MicrosoftEvent[]
}

interface MicrosoftCreatedEvent {
  id: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

async function refreshAccessToken(integrationId: string, refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "Calendars.ReadWrite User.Read offline_access",
  })

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as MicrosoftTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt,
    },
  })

  return data.access_token
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getValidAccessToken(userId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.MICROSOFT_OUTLOOK } },
  })

  if (!integration) {
    throw new Error(`No Microsoft Outlook integration found for user ${userId}`)
  }

  const bufferMs = 5 * 60 * 1000
  const isExpired =
    integration.expiresAt !== null &&
    integration.expiresAt.getTime() - bufferMs < Date.now()

  if (!isExpired) return integration.accessToken

  if (!integration.refreshToken) {
    throw new Error("Microsoft Outlook token is expired and no refresh token is available")
  }

  return refreshAccessToken(integration.id, integration.refreshToken)
}

export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>> {
  const accessToken = await getValidAccessToken(userId)

  const dayStart = toUTC(`${date}T00:00:00`, timezone)
  const dayEnd = toUTC(`${date}T00:00:00`, timezone, 1)

  const params = new URLSearchParams({
    startDateTime: dayStart.toISOString(),
    endDateTime: dayEnd.toISOString(),
    $select: "start,end,isCancelled",
    $top: "50",
  })

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft Calendar events fetch failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as MicrosoftEventsResponse
  const events = data.value ?? []

  const intervals: Array<{ start: Date; end: Date }> = []
  for (const event of events) {
    if (event.isCancelled) continue
    const start = new Date(event.start.dateTime + "Z")
    const end = new Date(event.end.dateTime + "Z")
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      intervals.push({ start, end })
    }
  }

  return intervals
}

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
    descriptionParts.push(`Phone: ${appointment.patientPhone}`)
  }

  const eventBody = {
    subject: `${appointment.service} — ${appointment.patientName}`,
    body: { contentType: "text", content: descriptionParts.join("\n") },
    start: { dateTime: startTime.toISOString(), timeZone: "UTC" },
    end: { dateTime: endTime.toISOString(), timeZone: "UTC" },
  }

  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/events",
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
    throw new Error(`Microsoft Calendar event creation failed (${res.status}): ${text}`)
  }

  const created = (await res.json()) as MicrosoftCreatedEvent
  return { eventId: created.id }
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  try {
    const accessToken = await getValidAccessToken(userId)

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok && res.status !== 404) {
      const text = await res.text()
      console.error(`[deleteCalendarEvent] Microsoft Calendar DELETE failed (${res.status}): ${text}`)
    }
  } catch (err) {
    console.error("[deleteCalendarEvent] Error deleting Microsoft calendar event", err)
  }
}
