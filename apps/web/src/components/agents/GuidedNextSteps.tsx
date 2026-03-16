'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface GuidedNextStepsProps {
  agentId: string
  agentName: string
  hasTested?: boolean
}

export function GuidedNextSteps({ agentId, agentName, hasTested = false }: GuidedNextStepsProps) {
  const [visible, setVisible] = useState(true)

  // Strip ?new=true / ?tested=true from URL on mount, keep UI visible via local state.
  // Use window.history.replaceState to avoid a React navigation that causes hydration mismatch.
  useEffect(() => {
    window.history.replaceState(null, '', `/dashboard/voice-agents/${agentId}`)
  }, [agentId])

  if (!visible) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-success font-medium text-sm">✓</span>
          <h2 className="font-serif text-xl text-ink">{agentName} is ready</h2>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-xs text-muted hover:text-ink transition-colors"
        >
          Dismiss
        </button>
      </div>
      <p className="text-sm text-muted mb-5">Complete these two steps to go live:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Step 1: Test */}
        <div className={`bg-white rounded-xl border p-5 ${hasTested ? 'border-success/30' : 'border-border'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${hasTested ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
              {hasTested ? '✓' : '1'}
            </span>
            <p className="font-medium text-ink">Test your agent</p>
          </div>
          <p className="text-sm text-muted mb-4 ml-7">
            Hear exactly how it sounds before going live.
          </p>
          <div className="ml-7">
            <Link
              href={`/dashboard/voice-agents/${agentId}/test`}
              className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasTested
                  ? 'bg-white border border-border text-ink hover:bg-cream'
                  : 'bg-accent text-white hover:bg-accent/90'
              }`}
            >
              {hasTested ? 'Test again' : 'Start test call'}
            </Link>
          </div>
        </div>

        {/* Step 2: Get a number */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">2</span>
            <p className="font-medium text-ink">Get a phone number</p>
          </div>
          <p className="text-sm text-muted mb-4 ml-7">
            Assign a number, then deploy to start handling real calls.
          </p>
          <div className="ml-7">
            <button
              onClick={() => {
                setVisible(false)
                document.getElementById('phone-number-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasTested
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'bg-white border border-border text-ink hover:bg-cream'
              }`}
            >
              Set up number
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
