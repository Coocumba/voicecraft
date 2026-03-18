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

type CarrierId = 'att' | 'verizon' | 'tmobile' | 'india' | 'uk' | 'australia' | 'other'

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
  { id: 'india', label: 'India' },
  { id: 'uk', label: 'UK' },
  { id: 'australia', label: 'Australia' },
  { id: 'other', label: 'Other' },
]

function buildInstructions(formattedNumber: string, rawNumber: string): Record<CarrierId, CarrierInstructions> {
  // Strip leading + for dialing strings
  const dialDigits = rawNumber.replace(/^\+/, '')

  return {
    att: {
      steps: [
        {
          text: 'On your current business phone, open the dialer.',
          sub: 'This is the same phone your callers reach today.',
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
    india: {
      steps: [
        {
          text: 'On your current phone, open the dialer.',
          sub: 'This works on all Indian carriers (Jio, Airtel, Vi, BSNL).',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'This is the standard GSM unconditional forwarding code.',
        },
        {
          text: 'Wait for the confirmation message, then hang up.',
          sub: 'You should see a notification or hear "Call forwarding activated."',
        },
      ],
      note: 'This uses the standard GSM code **21* which works on all Indian mobile carriers. If it doesn\'t work, try: Settings \u2192 Phone/Call \u2192 Call Forwarding \u2192 Always Forward.',
      cancelCode: '##21#',
    },
    uk: {
      steps: [
        {
          text: 'On your current phone, open the dialer.',
          sub: 'Works on EE, Three, O2, Vodafone, and most UK carriers.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'This is the standard GSM unconditional forwarding code.',
        },
        {
          text: 'Wait for the confirmation, then hang up.',
          sub: 'Your carrier will confirm that forwarding is active.',
        },
      ],
      note: 'For BT landlines, call forwarding is set up differently — dial 21 followed by the number, then press #. Contact BT support if this doesn\'t work.',
      cancelCode: '##21#',
    },
    australia: {
      steps: [
        {
          text: 'On your current phone, open the dialer.',
          sub: 'Works on Telstra, Optus, Vodafone AU, and most Australian carriers.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'This is the standard GSM unconditional forwarding code.',
        },
        {
          text: 'Wait for the confirmation, then hang up.',
          sub: 'You should hear a tone or get an SMS confirming forwarding is active.',
        },
      ],
      note: 'For Telstra landlines, you may need to call 12 + the destination number, or contact Telstra to enable call diversion on your service.',
      cancelCode: '##21#',
    },
    other: {
      steps: [
        {
          text: 'On your current phone, open the dialer.',
          sub: 'This is the phone number your callers reach today.',
        },
        {
          text: 'Dial the following code, then press Call.',
          sub: 'This is the international GSM standard for unconditional call forwarding.',
        },
        {
          text: "If this doesn't work, go to your phone's Settings \u2192 Call Forwarding, or contact your carrier for help with \"unconditional call forwarding.\"",
        },
      ],
      note: "Most mobile carriers worldwide support the **21* code. US carriers (AT&T, Verizon, T-Mobile) use *72 instead — select your carrier tab above for specific instructions.",
      cancelCode: '##21#',
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if an E.164 number is a US/Canada number */
function isUSNumber(e164: string): boolean {
  return /^\+1\d{10}$/.test(e164)
}

/** Get the forwarding dial prefix for a carrier */
function getForwardPrefix(carrierId: CarrierId): string {
  // US carriers use *72, rest of world uses **21* (GSM standard)
  if (carrierId === 'att' || carrierId === 'verizon' || carrierId === 'tmobile') return '*72'
  return '**21*'
}

/** Get the forwarding dial suffix for a carrier */
function getForwardSuffix(carrierId: CarrierId): string {
  // GSM codes need a trailing #
  if (carrierId === 'att' || carrierId === 'verizon' || carrierId === 'tmobile') return ''
  return '#'
}

/**
 * Formats an E.164 number for display inside the code pill.
 * US carriers:     *72 (XXX) XXX-XXXX
 * International:   **21*+XXXXXXXXXXX#
 */
function formatCodeDisplay(e164: string, carrierId: CarrierId): string {
  const prefix = getForwardPrefix(carrierId)
  const suffix = getForwardSuffix(carrierId)
  const usMatch = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (usMatch && (carrierId === 'att' || carrierId === 'verizon' || carrierId === 'tmobile')) {
    return `${prefix} (${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`
  }
  return `${prefix}${e164.replace(/^\+/, '')}${suffix}`
}

/**
 * Produces the paste-friendly dial string.
 * US carriers:     *72XXXXXXXXXX
 * International:   **21*XXXXXXXXXXX#
 */
function formatCodeCopy(e164: string, carrierId: CarrierId): string {
  const prefix = getForwardPrefix(carrierId)
  const suffix = getForwardSuffix(carrierId)
  const usMatch = e164.match(/^\+1(\d{10})$/)
  if (usMatch && (carrierId === 'att' || carrierId === 'verizon' || carrierId === 'tmobile')) {
    return `${prefix}${usMatch[1]}`
  }
  return `${prefix}${e164.replace(/^\+/, '')}${suffix}`
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
  // Default to a sensible tab based on the provisioned number's country code
  const [activeCarrier, setActiveCarrier] = useState<CarrierId>(() => {
    if (voicecraftNumber.startsWith('+1')) return 'other' // US — user picks their carrier
    if (voicecraftNumber.startsWith('+91')) return 'india'
    if (voicecraftNumber.startsWith('+44')) return 'uk'
    if (voicecraftNumber.startsWith('+61')) return 'australia'
    return 'other'
  })

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

  const displayCode = formatCodeDisplay(voicecraftNumber, activeCarrier)
  const copyCode = formatCodeCopy(voicecraftNumber, activeCarrier)
  const allInstructions = buildInstructions(displayCode, voicecraftNumber)
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
