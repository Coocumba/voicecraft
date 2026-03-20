'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface BookingAgent {
  id: string
  name: string
  services: string[]
}

interface NewAppointmentDrawerProps {
  isOpen: boolean
  onClose: () => void
  bookingAgents: BookingAgent[]
  hasCalendarIntegration: boolean
  defaultAgentId?: string
}

export function NewAppointmentDrawer({
  isOpen,
  onClose,
  bookingAgents,
  hasCalendarIntegration,
  defaultAgentId,
}: NewAppointmentDrawerProps) {
  const router = useRouter()

  const initialAgentId = defaultAgentId ?? bookingAgents[0]?.id ?? ''
  const [agentId, setAgentId] = useState(initialAgentId)
  const [service, setService] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [date, setDate] = useState(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  })
  const [time, setTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedAgent = bookingAgents.find((a) => a.id === agentId)
  const hasServices = selectedAgent && selectedAgent.services.length > 0

  // Reset service when agent changes
  useEffect(() => {
    if (hasServices && selectedAgent.services[0]) {
      setService(selectedAgent.services[0])
    } else {
      setService('')
    }
  }, [agentId, hasServices, selectedAgent])

  // Sync defaultAgentId when it changes
  useEffect(() => {
    if (defaultAgentId) {
      setAgentId(defaultAgentId)
    }
  }, [defaultAgentId])

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    if (!agentId || !service || !patientName || !date || !time) {
      toast.error('Please fill in all required fields')
      return
    }

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString()

    setSubmitting(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          service,
          patientName,
          patientPhone: patientPhone || undefined,
          scheduledAt,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create appointment')
      }

      toast.success('Appointment created')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create appointment')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white shadow-xl lg:rounded-l-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-serif text-lg font-semibold text-ink">New Appointment</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-ink hover:bg-cream transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Agent</label>
            <div className="relative">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className={`${inputClass} appearance-none pr-8 cursor-pointer`}
              >
                {bookingAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Service</label>
            {hasServices ? (
              <div className="relative">
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className={`${inputClass} appearance-none pr-8 cursor-pointer`}
                >
                  {selectedAgent.services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </div>
            ) : (
              <input
                type="text"
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="e.g. Cleaning, Consultation"
                className={inputClass}
                required
              />
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Name</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Full name"
              className={inputClass}
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Phone number <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className={inputClass}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          {/* Calendar sync notice */}
          <div className="pt-2">
            {hasCalendarIntegration ? (
              <p className="text-sm text-success">
                This appointment will be synced to your calendar.
              </p>
            ) : (
              <p className="text-sm text-muted">
                This appointment won&apos;t sync to your calendar.{' '}
                <a
                  href="/api/integrations/google?returnTo=%2Fappointments"
                  className="text-accent hover:underline"
                >
                  Connect now
                </a>
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Appointment'}
          </button>
        </form>
      </div>
    </div>
  )
}
