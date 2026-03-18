'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { formatPhone } from '@/lib/format-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CallForwardingGuideProps {
  voicecraftNumber: string // E.164, e.g. "+15551234567"
  agentId: string          // Used to key localStorage state
}

type PhoneType = 'iphone' | 'android' | 'landline'

interface PhoneTab {
  id: PhoneType
  label: string
}

interface InstructionStep {
  text: string
  sub?: string
  showNumber?: boolean // Render the number pill after this step
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHONE_TABS: PhoneTab[] = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'landline', label: 'Landline / Office' },
]

function getInstructions(phoneType: PhoneType): {
  steps: InstructionStep[]
  note?: string
  cancelTip: string
} {
  switch (phoneType) {
    case 'iphone':
      return {
        steps: [
          {
            text: 'Open Settings on your iPhone.',
          },
          {
            text: 'Tap Phone, then tap Call Forwarding.',
          },
          {
            text: 'Toggle Call Forwarding on.',
          },
          {
            text: 'Tap "Forward To" and enter this number:',
            showNumber: true,
          },
        ],
        cancelTip: 'To turn it off, go back to Settings \u2192 Phone \u2192 Call Forwarding and toggle it off.',
      }
    case 'android':
      return {
        steps: [
          {
            text: 'Open the Phone app on your Android device.',
          },
          {
            text: 'Tap the menu (\u22EE) and open Settings.',
            sub: 'On some phones, go to Settings app \u2192 search "Call Forwarding" instead.',
          },
          {
            text: 'Find Call Forwarding (under Calls or Supplementary Services).',
            sub: 'The exact location varies by brand. Use the search bar in Settings if you can\u2019t find it.',
          },
          {
            text: 'Tap "Always Forward" and enter this number:',
            showNumber: true,
          },
        ],
        note: 'Android menus vary by brand (Samsung, Pixel, Xiaomi, etc.). If you can\u2019t find Call Forwarding, search for it in your Settings app \u2014 every Android phone has a search bar at the top of Settings.',
        cancelTip: 'To turn it off, go back to the same Call Forwarding setting and tap Disable or Turn Off.',
      }
    case 'landline':
      return {
        steps: [
          {
            text: 'Contact your phone provider (the company that runs your office phone line).',
            sub: 'This is usually your internet or telephone company.',
          },
          {
            text: 'Ask them to set up "unconditional call forwarding" to this number:',
            showNumber: true,
          },
          {
            text: 'They\u2019ll confirm once it\u2019s active. Some providers can do it instantly over the phone.',
          },
        ],
        note: 'Some providers let you set this up yourself through their website or app. Check your provider\u2019s website for "call forwarding" or "call diversion" settings.',
        cancelTip: 'To turn it off, contact your provider again and ask them to remove the call forwarding.',
      }
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NumberPill({ number }: { number: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }, [number])

  return (
    <div className="flex sm:items-center items-stretch flex-col sm:flex-row gap-2 w-full">
      <div className="flex-1 flex items-center gap-2 bg-cream border border-border rounded-lg px-4 py-2.5 min-w-0">
        <span
          className="font-mono text-sm text-ink tracking-wide truncate"
          aria-label={`Phone number: ${number}`}
        >
          {formatPhone(number)}
        </span>
      </div>
      <button
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Number copied' : 'Copy number'}
        className={cn(
          'shrink-0 px-4 py-2 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
          copied
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-white border-border text-ink hover:bg-cream hover:border-border',
        )}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CallForwardingGuide({ voicecraftNumber, agentId }: CallForwardingGuideProps) {
  const storageKey = `forwarding-guide-${agentId}`

  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<PhoneType>('iphone')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        setExpanded(stored === 'expanded')
      }
    } catch {
      // localStorage unavailable
    }
  }, [storageKey])

  const persist = useCallback(
    (nextExpanded: boolean) => {
      try {
        localStorage.setItem(storageKey, nextExpanded ? 'expanded' : 'collapsed')
      } catch {
        // Ignore
      }
      setExpanded(nextExpanded)
    },
    [storageKey],
  )

  const { steps, note, cancelTip } = getInstructions(activeTab)

  // ---------------------------------------------------------------------------
  // Collapsed state
  // ---------------------------------------------------------------------------

  if (!expanded) {
    return (
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0 text-muted" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-sm text-muted flex-1">Call forwarding instructions available</p>
          <button
            onClick={() => persist(true)}
            className="text-xs text-accent hover:text-accent/80 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded"
          >
            Show instructions
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Expanded state
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="font-serif text-base text-ink leading-snug">
          Forward your existing number
        </h3>
        <button
          onClick={() => persist(false)}
          className="text-xs text-muted hover:text-ink font-medium transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-accent rounded"
        >
          Hide
        </button>
      </div>

      <p className="text-sm text-muted mb-4">
        Direct calls from your current number to VoiceCraft &mdash; takes about 2 minutes.
      </p>

      <hr className="border-border mb-4" />

      {/* Phone type tabs */}
      <div
        role="tablist"
        aria-label="Select your phone type"
        className="flex flex-wrap gap-2 mb-5"
      >
        {PHONE_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
              activeTab === tab.id
                ? 'border-accent bg-accent/5 text-accent'
                : 'border-border bg-cream text-muted hover:text-ink hover:bg-white',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Instructions panel */}
      <div
        role="tabpanel"
        aria-live="polite"
        aria-label={`Instructions for ${PHONE_TABS.find((t) => t.id === activeTab)?.label}`}
      >
        <ol className="space-y-4 mb-5">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span
                className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs font-medium flex items-center justify-center"
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink leading-snug">{step.text}</p>
                {step.sub && (
                  <p className="text-xs text-muted mt-0.5">{step.sub}</p>
                )}

                {step.showNumber && (
                  <div className="mt-3">
                    <NumberPill number={voicecraftNumber} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Phone-type-specific note */}
        {note && (
          <div className="bg-cream border border-border rounded-lg px-4 py-3 mb-5">
            <p className="text-xs text-muted leading-relaxed">{note}</p>
          </div>
        )}

        {/* Test nudge */}
        <div className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 mb-5">
          <p className="text-xs text-ink leading-relaxed">
            <span className="font-medium">Test it:</span> Call your old number from another phone. If VoiceCraft
            answers, you&apos;re all set.
          </p>
        </div>

        {/* Cancel tip */}
        <div className="mb-5">
          <p className="text-xs text-muted">{cancelTip}</p>
        </div>
      </div>

      {/* Footer */}
      <hr className="border-border mb-4" />
      <button
        onClick={() => persist(false)}
        className="text-xs text-accent hover:text-accent/80 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded"
      >
        I&apos;ve set up forwarding &mdash; hide these instructions
      </button>
    </div>
  )
}
