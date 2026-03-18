import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AppointmentStatus, IntegrationProvider } from '@voicecraft/db'
import type { AgentConfig } from '@/lib/builder-types'
import { AppointmentsClient } from '@/components/appointments/AppointmentsClient'
import type { AppointmentData } from '@/components/appointments/AppointmentCard'
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

export const metadata = { title: 'Appointments — VoiceCraft' }

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // Fetch all agents belonging to this user (for the filter dropdown)
  const [agents, hasCalendarIntegration, allUserAgents] = await Promise.all([
    prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.integration.findFirst({
      where: {
        userId,
        provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
      },
      select: { id: true },
    }).then(Boolean),
    prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true, config: true },
    }),
  ])

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

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  // Fetch appointments and stats in parallel
  const [appointments, todayCount, upcomingCount, totalCount] = await Promise.all([
    prisma.appointment.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { scheduledAt: 'desc' },
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
    agent: appt.agent,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-8">Appointments</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-800 mb-6">
          <span>Connect your calendar to avoid double-bookings and sync appointments automatically.</span>
          <div className="ml-4 flex-shrink-0">
            <CalendarConnectButtons returnTo="/dashboard/appointments" />
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
