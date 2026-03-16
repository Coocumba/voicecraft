'use client'

import { useState } from 'react'
import type { AgentConfig } from '@/lib/builder-types'

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

interface CollapsibleConfigProps {
  config: AgentConfig
}

export function CollapsibleConfig({ config }: CollapsibleConfigProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-4"
      >
        <span>{open ? '▴' : '▾'}</span>
        <span>{open ? 'Hide configuration' : 'View configuration'}</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.greeting && (
            <div className="bg-white rounded-xl border border-border p-5 md:col-span-2">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">Greeting</p>
              <p className="text-sm text-ink italic">&ldquo;{config.greeting}&rdquo;</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-border p-5">
            <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Details</p>
            <div className="space-y-2">
              {config.tone && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Tone</span>
                  <span className="text-ink capitalize">{config.tone}</span>
                </div>
              )}
              {config.language && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Language</span>
                  <span className="text-ink uppercase">{config.language}</span>
                </div>
              )}
              {config.voice?.gender && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Voice</span>
                  <span className="text-ink capitalize">
                    {config.voice.gender}{config.voice.style ? ` · ${config.voice.style}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {config.services && config.services.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Services</p>
              <div className="space-y-2">
                {config.services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-muted">{s.duration}min · ${s.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.hours && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Business Hours</p>
              <div className="space-y-1.5">
                {Object.entries(config.hours).map(([day, hours]) => (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{DAY_LABELS[day] ?? day}</span>
                    <span className="text-ink">{hours ? `${hours.open} – ${hours.close}` : 'Closed'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.escalation_rules && config.escalation_rules.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Escalation Rules</p>
              <ul className="space-y-1.5">
                {config.escalation_rules.map((rule, i) => (
                  <li key={i} className="text-sm text-ink flex gap-2">
                    <span className="text-muted flex-shrink-0">·</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
