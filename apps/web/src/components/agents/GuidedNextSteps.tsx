'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface GuidedNextStepsProps {
  agentId: string
  agentName: string
  hasTested?: boolean
  needsCalendar?: boolean
  hasPhoneNumber?: boolean
  needsSms?: boolean // true when agent has phone + can book + smsEnabled is false
}

export function GuidedNextSteps({ agentId, agentName, hasTested = false, needsCalendar = false, hasPhoneNumber = false, needsSms = false }: GuidedNextStepsProps) {
  const [visible, setVisible] = useState(true)

  // Strip ?new=true / ?tested=true from URL on mount, keep UI visible via local state.
  // Use window.history.replaceState to avoid a React navigation that causes hydration mismatch.
  useEffect(() => {
    window.history.replaceState(null, '', `/dashboard/voice-agents/${agentId}`)
  }, [agentId])

  if (!visible) return null

  const calendarReturnTo = encodeURIComponent(`/dashboard/voice-agents/${agentId}?new=true`)

  // Step numbers depend on which optional steps are shown
  let stepCounter = 1
  const calendarStepNum = needsCalendar ? stepCounter++ : 0
  const testStepNum = stepCounter++
  const numberStepNum = stepCounter++
  const smsStepNum = needsSms ? stepCounter++ : 0

  // Grid columns: adapt to number of steps
  const totalSteps = (needsCalendar ? 1 : 0) + 2 + (needsSms ? 1 : 0)
  const gridCols = totalSteps >= 4 ? 'lg:grid-cols-4' : totalSteps >= 3 ? 'lg:grid-cols-3' : ''

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
      <p className="text-sm text-muted mb-5">Complete these steps to go live:</p>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${gridCols}`}>
        {/* Conditional: Connect Google Calendar */}
        {needsCalendar && (
          <div className="bg-white rounded-xl border border-amber-300 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{calendarStepNum}</span>
              <p className="font-medium text-ink">Connect Google Calendar</p>
            </div>
            <p className="text-sm text-muted mb-4 ml-7">
              Your agent books appointments — connect Calendar to avoid conflicts.
            </p>
            <div className="ml-7">
              <a
                href={`/api/integrations/google?returnTo=${calendarReturnTo}`}
                className="inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-amber-100 text-amber-800 hover:bg-amber-200"
              >
                Connect Calendar
              </a>
            </div>
          </div>
        )}

        {/* Test step */}
        <div className={`bg-white rounded-xl border p-5 ${hasTested ? 'border-success/30' : 'border-border'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${hasTested ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
              {hasTested ? '✓' : testStepNum}
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

        {/* Get a number step */}
        <div className={`bg-white rounded-xl border p-5 ${hasPhoneNumber ? 'border-success/30' : 'border-border'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${hasPhoneNumber ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
              {hasPhoneNumber ? '✓' : numberStepNum}
            </span>
            <p className="font-medium text-ink">{hasPhoneNumber ? 'Phone number assigned' : 'Get a phone number'}</p>
          </div>
          <p className="text-sm text-muted mb-4 ml-7">
            {hasPhoneNumber ? 'Your agent has a number and can receive calls.' : 'Assign a number, then deploy to start handling real calls.'}
          </p>
          <div className="ml-7">
            <button
              onClick={() => {
                setVisible(false)
                document.getElementById('phone-number-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasPhoneNumber
                  ? 'bg-white border border-border text-ink hover:bg-cream'
                  : hasTested
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'bg-white border border-border text-ink hover:bg-cream'
              }`}
            >
              {hasPhoneNumber ? 'View number' : 'Set up number'}
            </button>
          </div>
        </div>

        {/* Conditional: Enable text messages */}
        {needsSms && (
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">{smsStepNum}</span>
              <p className="font-medium text-ink">Enable text messages</p>
            </div>
            <p className="text-sm text-muted mb-4 ml-7">
              Let customers text this number for instant replies about hours, services, and appointments.
            </p>
            <div className="ml-7">
              <button
                onClick={() => {
                  setVisible(false)
                  document.getElementById('sms-toggle-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white border border-border text-ink hover:bg-cream"
              >
                Set up texts
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
