'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { AppointmentCard } from './AppointmentCard'
import type { AppointmentData } from './AppointmentCard'
import { NewAppointmentDrawer } from './NewAppointmentDrawer'

type FilterTab = 'all' | 'upcoming' | 'past' | 'cancelled'

interface Agent {
  id: string
  name: string
}

interface BookingAgent {
  id: string
  name: string
  services: string[]
}

interface AppointmentsClientProps {
  appointments: AppointmentData[]
  agents: Agent[]
  bookingAgents?: BookingAgent[]
  hasCalendarIntegration?: boolean
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

export function AppointmentsClient({ appointments, agents, bookingAgents, hasCalendarIntegration }: AppointmentsClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const now = new Date()

  const filtered = appointments.filter((appt) => {
    const scheduledDate = new Date(appt.scheduledAt)
    const isFuture = scheduledDate > now

    // Agent filter
    if (selectedAgentId !== 'all' && appt.agent.id !== selectedAgentId) return false

    // Tab filter
    switch (activeTab) {
      case 'upcoming':
        return appt.status === 'BOOKED' && isFuture
      case 'past':
        return !isFuture
      case 'cancelled':
        return appt.status === 'CANCELLED'
      case 'all':
      default:
        return true
    }
  })

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center">
        {/* Agent dropdown */}
        {agents.length > 1 && (
          <div className="relative">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="appearance-none text-sm border border-border rounded-lg pl-3 pr-8 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
              aria-label="Filter by agent"
            >
              <option value="all">All Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
          </div>
        )}

        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-ink'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* New Appointment button */}
        {bookingAgents && bookingAgents.length > 0 && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-full sm:w-auto sm:ml-auto bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            New Appointment
          </button>
        )}
      </div>

      {/* Appointment cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted">
            {appointments.length === 0
              ? 'No appointments yet. When your voice agents book appointments, they\'ll appear here.'
              : 'No appointments match the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((appt) => (
            <AppointmentCard key={appt.id} appointment={appt} />
          ))}
        </div>
      )}

      {bookingAgents && bookingAgents.length > 0 && (
        <NewAppointmentDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          bookingAgents={bookingAgents}
          hasCalendarIntegration={hasCalendarIntegration ?? false}
          defaultAgentId={selectedAgentId !== 'all' ? selectedAgentId : undefined}
        />
      )}
    </div>
  )
}
