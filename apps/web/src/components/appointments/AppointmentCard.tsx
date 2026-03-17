'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/date-utils'

export interface AppointmentData {
  id: string
  service: string
  scheduledAt: string // ISO string — serialized from server
  patientName: string
  patientPhone: string | null
  status: 'BOOKED' | 'CANCELLED' | 'COMPLETED'
  calendarEventId: string | null
  agent: {
    id: string
    name: string
    businessName: string
  }
}

interface AppointmentCardProps {
  appointment: AppointmentData
}

function StatusBadge({ status }: { status: AppointmentData['status'] }) {
  const classes = {
    BOOKED: 'bg-success/10 text-success',
    CANCELLED: 'bg-red-100 text-red-700',
    COMPLETED: 'bg-muted/15 text-muted',
  }
  const labels = {
    BOOKED: 'Booked',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
  }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', classes[status])}>
      {labels[status]}
    </span>
  )
}

export function AppointmentCard({ appointment }: AppointmentCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const scheduledDate = new Date(appointment.scheduledAt)
  const now = new Date()
  const isFuture = scheduledDate > now
  const canCancel = appointment.status === 'BOOKED' && isFuture

  async function handleCancel() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/appointments/${appointment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        })

        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to cancel appointment')
        }

        toast.success('Appointment cancelled')
        setConfirmingCancel(false)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        toast.error(message)
        setConfirmingCancel(false)
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      {/* Top row: service + date */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="font-medium text-ink leading-snug">{appointment.service}</p>
        <p className="text-sm text-muted whitespace-nowrap flex-shrink-0">
          {formatDateTime(scheduledDate)}
        </p>
      </div>

      {/* Client info */}
      <p className="text-sm text-muted">
        {appointment.patientName}
        {appointment.patientPhone && (
          <span className="text-muted/70"> · {appointment.patientPhone}</span>
        )}
      </p>

      {/* Bottom row: agent + status + calendar sync + cancel */}
      <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs text-muted truncate">{appointment.agent.name}</p>
          <StatusBadge status={appointment.status} />
          {appointment.calendarEventId && (
            <span
              title="Synced to Google Calendar"
              className="text-xs text-success"
              aria-label="Synced to Google Calendar"
            >
              ✓ Cal
            </span>
          )}
        </div>

        {canCancel && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {confirmingCancel ? (
              <>
                <span className="text-xs text-muted">Cancel this appointment?</span>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Cancelling…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={isPending}
                  className="text-xs font-medium text-muted hover:text-ink disabled:opacity-50 transition-colors"
                >
                  No
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="text-xs font-medium text-muted hover:text-red-600 border border-border rounded-md px-2.5 py-1 hover:border-red-200 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
