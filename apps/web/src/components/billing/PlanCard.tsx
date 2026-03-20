'use client'

import { cn } from '@/lib/utils'

interface PlanCardProps {
  name: string
  description: string
  /** Price in cents */
  price: number
  cycle: 'MONTHLY' | 'ANNUAL'
  minutes: number
  calls: string
  overage: number
  agents: number
  highlight: boolean
  ctaLabel: string
  onSelect: () => void
  loading: boolean
  annualTotal: number
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

export function PlanCard({
  name,
  description,
  price,
  cycle,
  minutes,
  calls,
  overage,
  agents,
  highlight,
  ctaLabel,
  onSelect,
  loading,
  annualTotal,
}: PlanCardProps) {
  const priceInDollars = Math.round(price / 100)
  const overageDisplay = `$${(overage / 100).toFixed(2)}`

  const minutesFormatted = minutes.toLocaleString()
  const annualTotalDollars = Math.round(annualTotal / 100)

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border p-5 sm:p-6 flex flex-col',
        highlight
          ? 'border-accent ring-2 ring-accent relative'
          : 'border-border'
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-xs font-medium text-white bg-accent px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-3">
        <h3 className="font-serif text-xl text-ink mb-1">{name}</h3>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-4xl text-ink">${priceInDollars}</span>
          <span className="text-sm text-muted">/mo</span>
        </div>
        {/* Reserve a fixed line so card height doesn't shift on toggle */}
        <p className={`text-xs mt-1 h-4 ${cycle === 'ANNUAL' ? 'text-muted' : 'text-transparent select-none'}`}>
          Billed annually (${annualTotalDollars}/yr)
        </p>
      </div>

      <button
        onClick={onSelect}
        disabled={loading}
        className={cn(
          'w-full inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium rounded-xl transition-colors mb-4',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          highlight
            ? 'bg-accent text-white hover:bg-accent/90'
            : 'bg-ink text-white hover:bg-ink/90'
        )}
      >
        {loading ? 'Redirecting…' : ctaLabel}
      </button>

      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-ink">
            <strong>{minutesFormatted}</strong> minutes/mo{' '}
            <span className="text-muted">({calls})</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-ink">
            <strong>{agents}</strong> voice {agents === 1 ? 'agent' : 'agents'}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-ink">{overageDisplay}/min overage</span>
        </li>
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-ink">All features included</span>
        </li>
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-ink">14-day free trial</span>
        </li>
      </ul>
    </div>
  )
}
