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

  const serviceNames = config.services?.slice(0, 4).map((s) => s.name).join(', ')
  const extraServices = config.services && config.services.length > 4
    ? ` +${config.services.length - 4}`
    : ''

  const rows: { label: string; value: React.ReactNode }[] = []

  if (openDays) rows.push({ label: 'Hours', value: openDays })
  if (config.tone) rows.push({ label: 'Tone', value: <span className="capitalize">{config.tone}{config.voice?.style ? ` · ${config.voice.style}` : ''}</span> })
  if (config.voice?.gender) rows.push({ label: 'Voice', value: <span className="capitalize">{config.voice.gender}</span> })
  if (config.greeting) rows.push({ label: 'Greeting', value: <span className="italic">&ldquo;{config.greeting}&rdquo;</span> })
  if (serviceNames) rows.push({ label: 'Services', value: <>{serviceNames}{extraServices}</> })
  if (config.escalation_rules && config.escalation_rules.length > 0) {
    rows.push({ label: 'Escalation', value: `${config.escalation_rules.length} rule${config.escalation_rules.length !== 1 ? 's' : ''}` })
  }

  return (
    <div className="bg-white rounded-xl border border-border my-2">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60">
        <p className="text-xs text-accent font-medium mb-0.5">Ready to go</p>
        {config.business_name && (
          <p className="font-serif text-base text-ink">{config.business_name}</p>
        )}
      </div>

      {/* Rows */}
      <div className="px-4 py-1">
        {rows.map((row, i) => (
          <div key={row.label} className={`flex items-baseline justify-between gap-4 py-2 ${i < rows.length - 1 ? 'border-b border-border/40' : ''}`}>
            <span className="text-xs text-muted flex-shrink-0 w-16">{row.label}</span>
            <span className="text-sm text-ink text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
