'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UsageBar } from '@/components/billing/UsageBar'
import { TRIAL_MINUTES } from '@/lib/billing-constants'

interface UsageData {
  plan: {
    tier: string
    name: string
    cycle: string
    status: string
    currentPeriodStart: string
    currentPeriodEnd: string
    trialEnd: string | null
    cancelAtPeriodEnd: boolean
  }
  usage: {
    minutesUsed: number
    minutesIncluded: number
    overagePerMinute: number
  }
}

function trialDaysLeft(trialEnd: string | null): number | null {
  if (!trialEnd) return null
  const end = new Date(trialEnd)
  const now = new Date()
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    TRIALING: 'Trial',
    ACTIVE: 'Active',
    PAST_DUE: 'Past Due',
    PAUSED: 'Paused',
    CANCELED: 'Canceled',
  }
  return map[status] ?? status
}

function formatCycle(cycle: string): string {
  return cycle === 'ANNUAL' ? 'Annual' : 'Monthly'
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'TRIALING':
      return 'bg-accent/10 text-accent border border-accent/20'
    case 'ACTIVE':
      return 'bg-green-50 text-green-700 border border-green-200'
    case 'PAST_DUE':
      return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
    case 'PAUSED':
    case 'CANCELED':
      return 'bg-red-50 text-red-700 border border-red-200'
    default:
      return 'bg-border/50 text-muted border border-border'
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-5 w-32 rounded bg-border" />
        <div className="h-5 w-14 rounded-full bg-border" />
        <div className="h-5 w-16 rounded-full bg-border" />
      </div>
      <div className="h-8 w-36 rounded-lg bg-border" />
      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-border" />
        <div className="h-2 w-full rounded bg-border" />
      </div>
    </div>
  )
}

export function BillingSection() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    void fetch('/api/billing/usage')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load billing')
        return r.json()
      })
      .then((json: UsageData) => {
        setData(json)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  async function handleManageBilling() {
    if (portalLoading) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to open billing portal')
      const json = (await res.json()) as { url?: string }
      if (json.url) {
        window.location.href = json.url
      } else {
        throw new Error('No portal URL returned')
      }
    } catch {
      toast.error('Could not open billing portal. Please try again.')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <p className="text-sm text-muted">
        Could not load billing information. Please try refreshing the page.
      </p>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-muted">
        No subscription found.{' '}
        <a href="/choose-plan" className="text-accent underline underline-offset-2">
          Choose a plan
        </a>
        .
      </p>
    )
  }

  const { plan, usage } = data
  const daysLeft = trialDaysLeft(plan.trialEnd)
  const overageDollars = `$${(usage.overagePerMinute / 100).toFixed(2)}`

  const isOver = usage.minutesUsed > usage.minutesIncluded
  const overageMinutes = isOver ? usage.minutesUsed - usage.minutesIncluded : 0

  // Show trial minutes note when trialing
  const isTrialing = plan.status === 'TRIALING'

  return (
    <div className="space-y-5">
      {/* Plan info row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{plan.name}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(plan.status)}`}
            >
              {formatStatus(plan.status)}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cream text-muted border border-border">
              {formatCycle(plan.cycle)}
            </span>
          </div>
          {isTrialing && daysLeft !== null && (
            <p className="text-xs text-muted">
              {daysLeft > 0
                ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial`
                : 'Trial has ended'}
              {' — '}
              <a
                href="/choose-plan"
                className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
              >
                add a payment method
              </a>
            </p>
          )}
          {isTrialing && (
            <p className="text-xs text-muted">
              Trial includes {TRIAL_MINUTES} minutes.
            </p>
          )}
        </div>

        <button
          onClick={() => void handleManageBilling()}
          disabled={portalLoading}
          className="shrink-0 px-4 py-2 text-sm font-medium border border-border rounded-lg text-ink hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {portalLoading ? 'Opening…' : 'Manage billing'}
        </button>
      </div>

      {/* Usage bar */}
      <UsageBar
        used={usage.minutesUsed}
        included={usage.minutesIncluded}
        label="Call minutes"
      />

      {/* Overage info */}
      {isOver && (
        <p className="text-xs text-red-600">
          {overageMinutes.toLocaleString()} overage minute{overageMinutes === 1 ? '' : 's'} at {overageDollars}/min will be billed at the end of this period.
        </p>
      )}
      {!isOver && (
        <p className="text-xs text-muted">
          Overage rate: {overageDollars}/min if you exceed your included minutes.
        </p>
      )}
    </div>
  )
}
