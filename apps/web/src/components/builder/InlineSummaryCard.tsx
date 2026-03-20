import type { AgentConfig } from '@/lib/builder-types'

interface InlineSummaryCardProps {
  config: AgentConfig
  onSave?: () => void
  saving?: boolean
  editMode?: boolean
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export function InlineSummaryCard({ config, onSave, saving, editMode }: InlineSummaryCardProps) {
  const openDays = config.hours
    ? Object.entries(config.hours)
        .filter(([, h]) => h !== null)
        .map(([day]) => DAY_LABELS[day] ?? day)
        .join(', ')
    : null

  const serviceNames = config.services?.slice(0, 4).map((s) => s.name).join(', ')
  const extraServices = config.services && config.services.length > 4
    ? ` +${config.services.length - 4}`
    : ''

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm my-2 overflow-hidden">
      {/* Business name header */}
      <div className="px-4 py-3 bg-cream/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            {config.business_name && (
              <p className="text-sm font-medium text-ink leading-tight">{config.business_name}</p>
            )}
            <p className="text-[11px] text-muted">Your agent is ready</p>
          </div>
        </div>
      </div>

      {/* Config details — compact grid */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0">
          {openDays && (
            <>
              <span className="text-xs text-muted py-1.5">Hours</span>
              <span className="text-xs text-ink py-1.5 border-b border-border/30">{openDays}</span>
            </>
          )}
          {config.tone && (
            <>
              <span className="text-xs text-muted py-1.5">Tone</span>
              <span className="text-xs text-ink py-1.5 border-b border-border/30 capitalize">{config.tone}{config.voice?.style ? ` · ${config.voice.style}` : ''}</span>
            </>
          )}
          {config.voice?.gender && (
            <>
              <span className="text-xs text-muted py-1.5">Voice</span>
              <span className="text-xs text-ink py-1.5 border-b border-border/30 capitalize">{config.voice.gender}</span>
            </>
          )}
          {config.greeting && (
            <>
              <span className="text-xs text-muted py-1.5">Greeting</span>
              <span className="text-xs text-ink py-1.5 border-b border-border/30 italic line-clamp-1">&ldquo;{config.greeting}&rdquo;</span>
            </>
          )}
          {serviceNames && (
            <>
              <span className="text-xs text-muted py-1.5">Services</span>
              <span className="text-xs text-ink py-1.5 border-b border-border/30">{serviceNames}{extraServices}</span>
            </>
          )}
          {config.escalation_rules && config.escalation_rules.length > 0 && (
            <>
              <span className="text-xs text-muted py-1.5">Escalation</span>
              <span className="text-xs text-ink py-1.5">{config.escalation_rules.length} rule{config.escalation_rules.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Integrated CTA */}
      {onSave && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full bg-accent text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving
              ? editMode ? 'Saving changes…' : 'Creating agent…'
              : editMode ? 'Save changes' : 'Create Agent'}
          </button>
        </div>
      )}
    </div>
  )
}
