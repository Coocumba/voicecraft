'use client'

import { useState, useCallback } from 'react'
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

interface CallDetails {
  transcript: string | null
  summary: string | null
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
  const [details, setDetails] = useState<CallDetails | null>(
    call.transcript || call.summary
      ? { transcript: call.transcript, summary: call.summary }
      : null
  )
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false)
      return
    }

    // If details were not loaded yet (e.g. list page omits them), fetch on demand
    if (!details) {
      setLoading(true)
      setFetchError(false)
      try {
        const res = await fetch(`/api/calls/${call.id}`)
        if (res.ok) {
          const data: CallDetails = await res.json()
          setDetails(
            data.transcript || data.summary
              ? data
              : { transcript: null, summary: null }
          )
        } else {
          setFetchError(true)
        }
      } catch {
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }

    setExpanded(true)
  }, [expanded, details, fetchError, call.id])

  const hasVisibleDetails = details?.transcript || details?.summary

  return (
    <article className="bg-white rounded-xl border border-border p-5 transition-shadow hover:shadow-sm">
      {/* Main row */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: caller + contact + agent */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              {call.callerNumber ?? 'Test call'}
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
          {call.duration != null && call.duration > 0 && (
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

      {/* Expandable details trigger — always shown so details can be lazy-loaded */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={handleToggle}
          disabled={loading}
          className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1 disabled:opacity-50"
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
          {loading ? 'Loading…' : expanded ? 'Hide details' : 'View details'}
        </button>

        {expanded && hasVisibleDetails && (
          <div className="mt-3 space-y-3">
            {details?.summary && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Summary
                </p>
                <p className="text-sm text-ink leading-relaxed">{details.summary}</p>
              </div>
            )}
            {details?.transcript && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Transcript
                </p>
                <pre className="text-xs text-muted font-sans whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto bg-cream rounded-lg p-3">
                  {details.transcript}
                </pre>
              </div>
            )}
          </div>
        )}

        {expanded && fetchError && !loading && (
          <p className="mt-3 text-xs text-muted">Failed to load details. Click again to retry.</p>
        )}

        {expanded && !hasVisibleDetails && !fetchError && !loading && (
          <p className="mt-3 text-xs text-muted">No transcript or summary available for this call.</p>
        )}
      </div>
    </article>
  )
}
