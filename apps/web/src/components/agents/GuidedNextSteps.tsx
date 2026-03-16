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
      <div className="flex items-center gap-2 mb-2">
        <span className="text-success font-medium text-sm">✓</span>
        <h2 className="font-serif text-xl text-ink">{agentName} is ready</h2>
      </div>
      <p className="text-sm text-muted mb-5">Here&apos;s what to do next:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Test card — primary (before testing); secondary (after testing) */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="font-medium text-ink mb-1">🔊 Test your agent</p>
          <p className="text-sm text-muted mb-4">
            Hear exactly how it sounds before going live.
          </p>
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

        {/* Deploy card — secondary (before testing); primary (after testing) */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="font-medium text-ink mb-1">🚀 Deploy to a phone number</p>
          <p className="text-sm text-muted mb-4">
            Get a number and start handling real calls.
          </p>
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
            Get a phone number
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        {hasTested ? 'Ready to go live.' : 'We recommend testing first.'}
      </p>
    </div>
  )
}
