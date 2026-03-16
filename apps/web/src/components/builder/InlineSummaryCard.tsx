import type { AgentConfig } from '@/lib/builder-types'

interface InlineSummaryCardProps {
  config: AgentConfig
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export function InlineSummaryCard({ config }: InlineSummaryCardProps) {
  const openDays = config.hours
    ? Object.entries(config.hours)
        .filter(([, h]) => h !== null)
        .map(([day]) => DAY_LABELS[day] ?? day)
        .join(', ')
    : null

  return (
    <div className="bg-white rounded-xl border border-border p-4 my-3 space-y-2 text-sm">
      {config.business_name && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Business</span>
          <span className="text-ink font-medium text-right">{config.business_name}</span>
        </div>
      )}
      {openDays && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Open</span>
          <span className="text-ink text-right">{openDays}</span>
        </div>
      )}
      {config.tone && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Tone</span>
          <span className="text-ink capitalize text-right">{config.tone}</span>
        </div>
      )}
      {config.voice?.gender && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Voice</span>
          <span className="text-ink capitalize text-right">
            {config.voice.gender}{config.voice.style ? ` · ${config.voice.style}` : ''}
          </span>
        </div>
      )}
      {config.greeting && (
        <div className="flex flex-col gap-1">
          <span className="text-muted">Greeting</span>
          <span className="text-ink italic text-xs line-clamp-2">&ldquo;{config.greeting}&rdquo;</span>
        </div>
      )}
      {config.services && config.services.length > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Services</span>
          <span className="text-ink text-right">
            {config.services.slice(0, 3).map((s) => s.name).join(', ')}
            {config.services.length > 3 ? ` +${config.services.length - 3} more` : ''}
          </span>
        </div>
      )}
      {config.escalation_rules && config.escalation_rules.length > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Escalation</span>
          <span className="text-ink text-right">
            {config.escalation_rules.length} rule{config.escalation_rules.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
