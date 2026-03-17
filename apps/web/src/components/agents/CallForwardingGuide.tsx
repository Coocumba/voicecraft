'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CallForwardingGuideProps {
  voicecraftNumber: string // E.164, e.g. "+15551234567"
  agentId: string          // Used to key localStorage state
}

type CarrierId = 'att' | 'verizon' | 'tmobile' | 'other'

interface CarrierTab {
  id: CarrierId
  label: string
}

interface InstructionStep {
  text: string
  sub?: string
}

interface CarrierInstructions {
  steps: InstructionStep[]
  note?: string
  cancelCode: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARRIER_TABS: CarrierTab[] = [
  { id: 'att', label: 'AT&T' },
  { id: 'verizon', label: 'Verizon' },
  { id: 'tmobile', label: 'T-Mobile' },
  { id: 'other', label: 'Other carrier' },
]

function buildInstructions(formattedNumber: string): Record<CarrierId, CarrierInstructions> {
  return {
    att: {
      steps: [
        {
          text: 'On your current business phone, open the dialer.',
          sub: 'This is the same phone your patients call today.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'You should hear a confirmation tone or announcement.',
        },
        {
          text: 'Wait for the confirmation, then hang up.',
          sub: "AT&T will say 'Call Forwarding activated' or play 3 beeps.",
        },
      ],
      cancelCode: '*73',
    },
    verizon: {
      steps: [
        {
          text: 'On your current business phone, open the dialer.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'Listen for a double beep — that confirms it\'s active.',
        },
        {
          text: 'Wait for the confirmation tone, then hang up.',
        },
      ],
      note: 'If you have a Verizon landline, the code may be 72# instead. Try *72 first — if it doesn\'t work, use 72#.',
      cancelCode: '*73',
    },
    tmobile: {
      steps: [
        {
          text: 'On your current business phone, open the dialer.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: "T-Mobile will announce 'Call Forwarding is active.'",
        },
        {
          text: 'Wait for the announcement, then hang up.',
        },
      ],
      note: "T-Mobile may require confirmation via the My T-Mobile app if your plan has advanced call controls. If *72 doesn't work, open the app \u2192 Account \u2192 Line Settings \u2192 Call Forwarding.",
      cancelCode: '*720',
    },
    other: {
      steps: [
        {
          text: 'On your current business phone, open the dialer.',
          sub: 'This is the phone number your patients call today.',
        },
        {
          text: 'Most US carriers use this code to turn on call forwarding — dial it, then press Call.',
          sub: 'You should hear a confirmation tone or message.',
        },
        {
          text: "If *72 doesn't work, check your carrier's website for \"unconditional call forwarding\" or call their support line.",
        },
      ],
      note: "Not sure which carrier you have? Look at the top of your phone screen — it shows your carrier name next to the signal bars.",
      cancelCode: '*73',
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats an E.164 number for display inside the code pill.
 * US numbers (+1XXXXXXXXXX) → *72 (XXX) XXX-XXXX
 * Non-US numbers           → *72 <full number>
 */
function formatCodeDisplay(e164: string): string {
  const usMatch = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (usMatch) {
    return `*72 (${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`
  }
  // Non-US: strip the leading + for dialing string but show full number
  return `*72 ${e164.replace(/^\+/, '')}`
}

/**
 * Produces the paste-friendly dial string: *72 followed by digits only.
 * US (+1XXXXXXXXXX) → *721XXXXXXXXXX (keep country code for copy)
 * Actually the spec says strip +1 prefix for US, giving *72XXXXXXXXXX.
 */
function formatCodeCopy(e164: string): string {
  const usMatch = e164.match(/^\+1(\d{10})$/)
  if (usMatch) {
    return `*72${usMatch[1]}`
  }
  // Non-US: full number without the +
  return `*72${e164.replace(/^\+/, '')}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ForwardingCodePillProps {
  displayCode: string
  copyCode: string
}

function ForwardingCodePill({ displayCode, copyCode }: ForwardingCodePillProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available — silently ignore
    }
  }, [copyCode])

  return (
    <div className="flex sm:items-center items-stretch flex-col sm:flex-row gap-2 w-full">
      <div className="flex-1 flex items-center gap-2 bg-cream border border-border rounded-lg px-4 py-2.5 min-w-0">
        <span
          className="font-mono text-sm text-ink tracking-wide truncate"
          aria-label={`Forwarding code: ${displayCode}`}
        >
          {displayCode}
        </span>
      </div>
      <button
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Forwarding code copied' : 'Copy forwarding code'}
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

  // Default to expanded; hydrate from localStorage after mount to avoid SSR mismatch
  const [expanded, setExpanded] = useState(true)
  const [activeCarrier, setActiveCarrier] = useState<CarrierId>('other')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        setExpanded(stored === 'expanded')
      }
    } catch {
      // localStorage unavailable — keep default
    }
  }, [storageKey])

  const persist = useCallback(
    (nextExpanded: boolean) => {
      try {
        localStorage.setItem(storageKey, nextExpanded ? 'expanded' : 'collapsed')
      } catch {
        // Ignore write failures
      }
      setExpanded(nextExpanded)
    },
    [storageKey],
  )

  const displayCode = formatCodeDisplay(voicecraftNumber)
  const copyCode = formatCodeCopy(voicecraftNumber)
  const allInstructions = buildInstructions(displayCode)
  const current = allInstructions[activeCarrier]

  // ---------------------------------------------------------------------------
  // Collapsed state
  // ---------------------------------------------------------------------------

  if (!expanded) {
    return (
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          {/* Checkmark icon */}
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
        Direct calls from your current business number to VoiceCraft &mdash; takes about 2 minutes
        from your phone.
      </p>

      <hr className="border-border mb-4" />

      {/* Carrier tabs */}
      <div
        role="tablist"
        aria-label="Select your phone carrier"
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:gap-2 mb-5"
      >
        {CARRIER_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeCarrier === tab.id}
            onClick={() => setActiveCarrier(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
              activeCarrier === tab.id
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
        aria-label={`Instructions for ${CARRIER_TABS.find((t) => t.id === activeCarrier)?.label}`}
      >
        {/* Numbered steps */}
        <ol className="space-y-4 mb-5">
          {current.steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              {/* Step number badge */}
              <span
                className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-accent/10 text-accent text-xs font-medium flex items-center justify-center"
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="min-w-0">
                <p className="text-sm text-ink leading-snug">{step.text}</p>
                {step.sub && (
                  <p className="text-xs text-muted mt-0.5">{step.sub}</p>
                )}

                {/* Forwarding code pill renders after step 2 (index 1) */}
                {index === 1 && (
                  <div className="mt-3">
                    <ForwardingCodePill displayCode={displayCode} copyCode={copyCode} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Carrier-specific note box */}
        {current.note && (
          <div className="bg-cream border border-border rounded-lg px-4 py-3 mb-5">
            <p className="text-xs text-muted leading-relaxed">{current.note}</p>
          </div>
        )}

        {/* Confirmation nudge */}
        <div className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 mb-5">
          <p className="text-xs text-ink leading-relaxed">
            <span className="font-medium">Test it:</span> Once you&apos;ve dialed the code, call your
            old number from another phone. If VoiceCraft answers, you&apos;re all set.
          </p>
        </div>

        {/* Cancel forwarding note */}
        <div className="flex items-center gap-2 mb-5">
          <p className="text-xs text-muted">
            To turn off call forwarding later, dial{' '}
            <span className="font-mono text-ink">{current.cancelCode}</span> from your phone.
          </p>
        </div>
      </div>

      {/* Footer collapse link */}
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
