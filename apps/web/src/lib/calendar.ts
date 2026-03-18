import { prisma, IntegrationProvider } from "@voicecraft/db"

export interface BookingDetails {
  patientName: string
  patientPhone?: string
  scheduledAt: string
  service: string
  durationMinutes?: number
}

export type CalendarProvider = "google" | "microsoft" | null

const CALENDAR_PROVIDERS = [
  IntegrationProvider.GOOGLE_CALENDAR,
  IntegrationProvider.MICROSOFT_OUTLOOK,
]

export async function getConnectedProvider(userId: string): Promise<CalendarProvider> {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: { in: CALENDAR_PROVIDERS } },
    select: { provider: true },
  })
  if (!integration) return null
  return integration.provider === IntegrationProvider.GOOGLE_CALENDAR ? "google" : "microsoft"
}

export async function hasCalendarIntegration(userId: string): Promise<boolean> {
  const count = await prisma.integration.count({
    where: { userId, provider: { in: CALENDAR_PROVIDERS } },
  })
  return count > 0
}

export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.getCalendarEventsForDate(userId, date, timezone)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.getCalendarEventsForDate(userId, date, timezone)
  }
  return []
}

export async function bookAppointment(
  userId: string,
  details: BookingDetails
): Promise<{ eventId: string } | null> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.bookAppointment(userId, details)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.bookAppointment(userId, details)
  }
  return null
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.deleteCalendarEvent(userId, eventId)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.deleteCalendarEvent(userId, eventId)
  }
}
