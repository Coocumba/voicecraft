'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { UsageBar } from '@/components/billing/UsageBar'
import { TRIAL_MINUTES } from '@/lib/billing-constants'

export interface UsageData {
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
  const diff = new Date(trialEnd).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface BillingSectionProps {
  /** Pre-fetched billing data from the server component. When provided the
   *  client-side fetch is skipped entirely, eliminating the post-hydration
   *  waterfall on the Settings page. */
  initialData?: UsageData | null
}

export function BillingSection({ initialData }: BillingSectionProps = {}) {
  const [data, setData] = useState<UsageData | null>(initialData ?? null)
  const [loading, setLoading] = useState(initialData === undefined)
  const [error, setError] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    // Skip the fetch when the server already provided data.
    if (initialData !== undefined) return

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
  }, [initialData])

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
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 rounded-xl bg-border/40" />
        <div className="h-20 rounded-xl bg-border/40" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-muted py-4">
        Could not load billing information. Please try refreshing the page.
      </p>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-muted py-4">
        No subscription found.{' '}
        <Link href="/choose-plan" className="text-accent underline underline-offset-2">
          Choose a plan
        </Link>
      </p>
    )
  }

  const { plan, usage } = data
  const isTrialing = plan.status === 'TRIALING'
  const isPastDue = plan.status === 'PAST_DUE'
  const isPaused = plan.status === 'PAUSED' || plan.status === 'CANCELED'
  const daysLeft = trialDaysLeft(plan.trialEnd)
  const minutesIncluded = isTrialing ? TRIAL_MINUTES : usage.minutesIncluded
  const isOver = usage.minutesUsed > minutesIncluded
  const percentage = minutesIncluded > 0 ? Math.round((usage.minutesUsed / minutesIncluded) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Plan card */}
      <div className="rounded-xl border border-border bg-cream/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-medium text-ink">{plan.name}</span>
              {isTrialing && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-accent/10 text-accent">
                  Trial
                </span>
              )}
              {isPastDue && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-yellow-50 text-yellow-700">
                  Payment due
                </span>
              )}
              {isPaused && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-red-50 text-red-600">
                  Inactive
                </span>
              )}
            </div>
            {isTrialing && daysLeft !== null && daysLeft > 0 && (
              <p className="text-xs text-muted">
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
              </p>
            )}
            {isTrialing && daysLeft === 0 && (
              <p className="text-xs text-red-600">Trial ended</p>
            )}
            {!isTrialing && !isPaused && (
              <p className="text-xs text-muted">
                {plan.cycle === 'ANNUAL' ? 'Annual' : 'Monthly'} &middot; Renews {formatDate(plan.currentPeriodEnd)}
              </p>
            )}
          </div>
          <button
            onClick={() => void handleManageBilling()}
            disabled={portalLoading}
            className="shrink-0 text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            {portalLoading ? 'Opening...' : 'Manage'}
          </button>
        </div>
      </div>

      {/* Usage card */}
      <div className="rounded-xl border border-border bg-cream/50 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-sm text-ink font-medium">Usage</span>
          <span className="text-xs text-muted">
            {formatDate(plan.currentPeriodStart)} — {formatDate(plan.currentPeriodEnd)}
          </span>
        </div>

        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xl font-serif text-ink">
            {usage.minutesUsed.toLocaleString()}
            <span className="text-sm font-sans text-muted ml-1">
              / {minutesIncluded.toLocaleString()} min
            </span>
          </span>
          <span className={`text-xs font-medium ${isOver ? 'text-red-600' : percentage > 80 ? 'text-yellow-700' : 'text-muted'}`}>
            {isOver ? `${(usage.minutesUsed - minutesIncluded).toLocaleString()} over` : `${percentage}%`}
          </span>
        </div>

        <UsageBar used={usage.minutesUsed} included={minutesIncluded} />

        {isOver && (
          <p className="text-xs text-muted mt-3">
            Overage billed at ${(usage.overagePerMinute / 100).toFixed(2)}/min at end of period.
          </p>
        )}
      </div>

      {/* Trial CTA */}
      {isTrialing && (
        <button
          onClick={() => void handleManageBilling()}
          disabled={portalLoading}
          className="w-full text-center text-sm text-accent hover:text-accent/80 transition-colors py-2 disabled:opacity-50"
        >
          Add a payment method to keep your agent active after the trial &rarr;
        </button>
      )}

      {/* Past due CTA */}
      {isPastDue && (
        <button
          onClick={() => void handleManageBilling()}
          disabled={portalLoading}
          className="w-full text-center text-sm text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg py-2 transition-colors"
        >
          Update payment method
        </button>
      )}
    </div>
  )
}
