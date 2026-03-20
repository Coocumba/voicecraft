'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlanCard } from '@/components/billing/PlanCard'

interface Plan {
  id: string
  tier: string
  name: string
  monthlyPrice: number
  annualPricePerMonth: number
  annualPriceTotal: number
  minutesIncluded: number
  overagePerMinute: number
  maxAgents: number
}

interface ChoosePlanClientProps {
  plans: Plan[]
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  STARTER: 'For solo practitioners getting started with AI reception.',
  GROWTH: 'For growing practices that handle more volume.',
  PROFESSIONAL: 'For busy multi-location or high-volume businesses.',
}

const PLAN_CALLS: Record<string, string> = {
  STARTER: '~150 calls',
  GROWTH: '~450 calls',
  PROFESSIONAL: '~1,500 calls',
}

export function ChoosePlanClient({ plans }: ChoosePlanClientProps) {
  const router = useRouter()
  const [annual, setAnnual] = useState(false)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)

  async function handleSelect(tier: string) {
    if (loadingTier !== null) return
    setLoadingTier(tier)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, cycle: annual ? 'ANNUAL' : 'MONTHLY' }),
      })
      if (!res.ok) {
        throw new Error('Failed to create checkout session')
      }
      const data = (await res.json()) as { url?: string }
      if (data.url) {
        router.push(data.url)
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch {
      toast.error('Could not start checkout. Please try again.')
      setLoadingTier(null)
    }
  }

  return (
    <div className="min-h-screen md:h-screen bg-cream flex flex-col items-center md:justify-center px-4 sm:px-6 py-8 md:py-0 md:overflow-hidden">
      {/* Logo */}
      <p className="font-serif text-lg text-ink mb-6 md:mb-4">VoiceCraft</p>

      {/* Heading */}
      <div className="text-center mb-5 md:mb-4 max-w-xl">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-2">
          Choose your plan
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          Every plan includes a 14-day free trial with full access to all
          features. No credit card required to start.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center gap-3 mb-6 md:mb-5">
        <span
          className={`text-sm ${!annual ? 'text-ink font-medium' : 'text-muted'}`}
        >
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            annual ? 'bg-accent' : 'bg-border'
          }`}
          aria-label="Toggle annual billing"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              annual ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span
          className={`text-sm ${annual ? 'text-ink font-medium' : 'text-muted'}`}
        >
          Annual
        </span>
        {annual && (
          <span className="text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-2 py-0.5 rounded-full">
            Save 20%
          </span>
        )}
      </div>

      {/* Plan cards */}
      {plans.length === 0 && (
        <div className="text-center text-muted text-sm py-12">
          Plans are being configured. Please check back shortly.
        </div>
      )}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {plans.map((plan) => {
          const isGrowth = plan.tier === 'GROWTH'
          return (
            <PlanCard
              key={plan.tier}
              name={plan.name}
              description={
                PLAN_DESCRIPTIONS[plan.tier] ?? plan.name
              }
              price={
                annual ? plan.annualPricePerMonth : plan.monthlyPrice
              }
              cycle={annual ? 'ANNUAL' : 'MONTHLY'}
              minutes={plan.minutesIncluded}
              calls={PLAN_CALLS[plan.tier] ?? ''}
              overage={plan.overagePerMinute}
              agents={plan.maxAgents}
              highlight={isGrowth}
              ctaLabel="Start free trial"
              onSelect={() => void handleSelect(plan.tier)}
              loading={loadingTier === plan.tier}
              annualTotal={plan.annualPriceTotal}
            />
          )
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted mt-5 md:mt-4">
        Prices in USD. Local currency applied at checkout.
      </p>
    </div>
  )
}
