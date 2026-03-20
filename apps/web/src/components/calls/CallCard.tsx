'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/date-utils'
import { LocalTime } from '@/components/ui/LocalTime'

export type CallOutcomeValue = 'COMPLETED' | 'MISSED' | 'ESCALATED'

export interface CallCardData {
  id: string
  callerNumber: string | null
  duration: number | null
  outcome: CallOutcomeValue
  transcript: string | null
  summary: string | null
  createdAt: string // ISO string from JSON response
  contactName: string | null
  isReturningCaller: boolean
  agent: {
    id: string
    name: string
    businessName: string
  }
}

interface CallCardProps {
  call: CallCardData
}

function outcomeBadgeClass(outcome: CallOutcomeValue): string {
  switch (outcome) {
    case 'COMPLETED':
      return 'bg-success/10 text-success'
    case 'MISSED':
      return 'bg-muted/15 text-muted'
    case 'ESCALATED':
      return 'bg-accent/10 text-accent'
  }
}

function outcomeLabel(outcome: CallOutcomeValue): string {
  switch (outcome) {
    case 'COMPLETED':
      return 'Completed'
    case 'MISSED':
      return 'Missed'
    case 'ESCALATED':
      return 'Escalated'
  }
}

function OutcomeDot({ outcome }: { outcome: CallOutcomeValue }) {
  return (
    <span
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full mr-1',
        outcome === 'COMPLETED' && 'bg-success',
        outcome === 'MISSED' && 'bg-muted',
        outcome === 'ESCALATED' && 'bg-accent'
      )}
      aria-hidden="true"
    />
  )
}

export function CallCard({ call }: CallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = Boolean(call.transcript || call.summary)

  return (
    <article className="bg-white rounded-xl border border-border p-5 transition-shadow hover:shadow-sm">
      {/* Main row */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: caller + contact + agent */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              {call.callerNumber ?? 'Unknown caller'}
            </span>
            {call.isReturningCaller && (
              <span className="text-xs text-muted">returning</span>
            )}
          </div>

          {call.contactName && (
            <p className="text-sm text-muted mt-0.5">{call.contactName}</p>
          )}

          <p className="text-xs text-muted mt-1">{call.agent.name}</p>
        </div>

        {/* Right: date/time + duration + outcome */}
        <div className="flex-shrink-0 text-right">
          <LocalTime date={call.createdAt} className="text-xs text-muted" />
          {call.duration != null && (
            <p className="text-xs text-muted mt-0.5">
              {formatDuration(call.duration)}
            </p>
          )}
          <span
            className={cn(
              'inline-flex items-center mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium',
              outcomeBadgeClass(call.outcome)
            )}
          >
            <OutcomeDot outcome={call.outcome} />
            {outcomeLabel(call.outcome)}
          </span>
        </div>
      </div>

      {/* Expandable details trigger */}
      {hasDetails && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
            aria-expanded={expanded}
          >
            <span
              className={cn(
                'inline-block transition-transform duration-150',
                expanded ? 'rotate-90' : 'rotate-0'
              )}
              aria-hidden="true"
            >
              ▸
            </span>
            {expanded ? 'Hide details' : 'View details'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3">
              {call.summary && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                    Summary
                  </p>
                  <p className="text-sm text-ink leading-relaxed">{call.summary}</p>
                </div>
              )}
              {call.transcript && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                    Transcript
                  </p>
                  <pre className="text-xs text-muted font-sans whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto bg-cream rounded-lg p-3">
                    {call.transcript}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
