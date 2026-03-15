interface DayHours {
  open: string
  close: string
}

interface ServiceItem {
  name: string
  duration: number
  price: number
}

export interface AgentConfig {
  business_name?: string
  hours?: Record<string, DayHours | null>
  services?: ServiceItem[]
  tone?: string
  language?: string
  greeting?: string
  escalation_rules?: string[]
}

interface ConfigPreviewProps {
  config: AgentConfig | null
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export function ConfigPreview({ config }: ConfigPreviewProps) {
  if (!config) {
    return (
      <div className="bg-white rounded-xl border border-border p-6 h-full flex flex-col items-center justify-center text-center min-h-[200px]">
        <p className="text-sm font-medium text-ink mb-1">Configuration Preview</p>
        <p className="text-xs text-muted">
          Chat with the assistant to build your agent. The configuration will appear here once generated.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-5 overflow-y-auto">
      <h2 className="font-serif text-base text-ink">Configuration Preview</h2>

      {/* Business info */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Business</h3>
        <div className="space-y-1">
          {config.business_name && (
            <p className="text-sm text-ink font-medium">{config.business_name}</p>
          )}
          {config.tone && (
            <p className="text-xs text-muted">Tone: <span className="text-ink capitalize">{config.tone}</span></p>
          )}
          {config.language && (
            <p className="text-xs text-muted">Language: <span className="text-ink uppercase">{config.language}</span></p>
          )}
        </div>
      </section>

      {/* Greeting */}
      {config.greeting && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Greeting</h3>
          <p className="text-sm text-ink bg-cream rounded-lg p-3 italic">
            &ldquo;{config.greeting}&rdquo;
          </p>
        </section>
      )}

      {/* Hours */}
      {config.hours && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Business Hours</h3>
          <div className="space-y-1">
            {Object.entries(config.hours).map(([day, hours]) => (
              <div key={day} className="flex items-center justify-between text-xs">
                <span className="text-muted w-8">{DAY_LABELS[day] ?? day}</span>
                <span className="text-ink">
                  {hours ? `${hours.open} – ${hours.close}` : 'Closed'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Services */}
      {config.services && config.services.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Services</h3>
          <div className="space-y-1.5">
            {config.services.map((service, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-ink">{service.name}</span>
                <span className="text-muted">{service.duration}min · ${service.price}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Escalation rules */}
      {config.escalation_rules && config.escalation_rules.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Escalation Rules</h3>
          <ul className="space-y-1">
            {config.escalation_rules.map((rule, i) => (
              <li key={i} className="text-xs text-ink flex gap-2">
                <span className="text-muted flex-shrink-0">·</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
