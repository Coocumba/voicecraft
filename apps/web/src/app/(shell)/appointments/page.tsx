import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AppointmentStatus, IntegrationProvider } from '@voicecraft/db'
import type { AgentConfig } from '@/lib/builder-types'
import { AppointmentsClient } from '@/components/appointments/AppointmentsClient'
import type { AppointmentData } from '@/components/appointments/AppointmentCard'
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'
import { getUserTimezone, startOfDayInTimezone } from '@/lib/timezone-utils'

export const metadata = { title: 'Appointments' }

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // Single agent query with the superset of fields needed by both the filter
  // dropdown (id, name) and the booking-agents list (config).
  const [allUserAgents, hasCalendarIntegration] = await Promise.all([
    prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true, config: true },
      orderBy: { name: 'asc' },
    }),
    prisma.integration.findFirst({
      where: {
        userId,
        provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
      },
      select: { id: true },
    }).then(Boolean),
  ])

  // Derive the dropdown list from the same result set.
  const agents = allUserAgents.map((a) => ({ id: a.id, name: a.name }))

  const bookingAgentsWithServices = allUserAgents
    .filter((a) => {
      const c = a.config as AgentConfig | null
      return c?.can_book_appointments === true
    })
    .map((a) => ({
      id: a.id,
      name: a.name,
      services: ((a.config as AgentConfig | null)?.services ?? []).map((s) => s.name),
    }))

  const agentIds = agents.map((a) => a.id)

  const tz = await getUserTimezone()
  const now = new Date()
  const todayStart = startOfDayInTimezone(tz, now)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  // Fetch appointments and stats in parallel
  const [appointments, todayCount, upcomingCount, totalCount] = await Promise.all([
    prisma.appointment.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      include: {
        agent: { select: { id: true, name: true, businessName: true } },
      },
    }),
    prisma.appointment.count({
      where: {
        agentId: { in: agentIds },
        scheduledAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.appointment.count({
      where: {
        agentId: { in: agentIds },
        status: AppointmentStatus.BOOKED,
        scheduledAt: { gt: now },
      },
    }),
    prisma.appointment.count({
      where: { agentId: { in: agentIds } },
    }),
  ])

  // Serialize for the client component — Dates must become strings
  const serialized: AppointmentData[] = appointments.map((appt) => ({
    id: appt.id,
    service: appt.service,
    scheduledAt: appt.scheduledAt.toISOString(),
    patientName: appt.patientName,
    patientPhone: appt.patientPhone,
    status: appt.status as AppointmentData['status'],
    calendarEventId: appt.calendarEventId,
    reminderSent: appt.reminderSent,
    agent: appt.agent,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-8">Appointments</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Today</p>
          <p className="font-serif text-3xl text-ink">{todayCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Upcoming</p>
          <p className="font-serif text-3xl text-ink">{upcomingCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Total</p>
          <p className="font-serif text-3xl text-ink">{totalCount}</p>
        </div>
      </div>

      {/* Calendar nudge banner */}
      {!hasCalendarIntegration && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 text-sm text-accent mb-6">
          <span>Connect your calendar to avoid double-bookings and sync appointments automatically.</span>
          <div className="flex-shrink-0">
            <CalendarConnectButtons returnTo="/appointments" />
          </div>
        </div>
      )}

      {/* Client-side filtered list */}
      <AppointmentsClient
        appointments={serialized}
        agents={agents}
        bookingAgents={bookingAgentsWithServices}
        hasCalendarIntegration={hasCalendarIntegration}
      />
    </div>
  )
}
