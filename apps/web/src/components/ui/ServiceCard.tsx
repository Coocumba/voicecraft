import Link from 'next/link'

interface ServiceCardProps {
  label: string
  description: string
  emoji: string
  href: string
  available: boolean
  stats?: string
  ctaLabel: string
}

export function ServiceCard({
  label,
  description,
  emoji,
  href,
  available,
  stats,
  ctaLabel,
}: ServiceCardProps) {
  if (!available) {
    return (
      <div className="bg-white rounded-xl border border-border p-6 opacity-50 cursor-not-allowed select-none">
        <p className="text-2xl mb-3" aria-hidden="true">{emoji}</p>
        <h2 className="font-medium text-ink mb-1">{label}</h2>
        <p className="text-sm text-muted mb-4">{description}</p>
        <span className="text-xs text-muted">Coming soon</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 hover:border-accent/40 hover:shadow-sm transition-all">
      <p className="text-2xl mb-3" aria-hidden="true">{emoji}</p>
      <h2 className="font-medium text-ink mb-1">{label}</h2>
      <p className="text-sm text-muted mb-1">{description}</p>
      {stats && <p className="text-xs text-muted mb-3">{stats}</p>}
      <div className={stats ? 'mt-2' : 'mt-4'}>
        <Link
          href={href}
          className="inline-flex bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
