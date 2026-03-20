'use client'

import { cn } from '@/lib/utils'

interface UsageBarProps {
  used: number
  included: number
  label: string
}

export function UsageBar({ used, included, label }: UsageBarProps) {
  const isOver = used > included
  const percentage = included > 0 ? Math.min((used / included) * 100, 100) : 0
  const isWarning = !isOver && percentage > 80

  const barColor = isOver
    ? 'bg-red-500'
    : isWarning
      ? 'bg-yellow-400'
      : 'bg-accent'

  const overage = isOver ? used - included : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span
          className={cn(
            'font-medium',
            isOver ? 'text-red-600' : isWarning ? 'text-yellow-700' : 'text-ink'
          )}
        >
          {used.toLocaleString()} / {included.toLocaleString()} minutes used
        </span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isOver && (
        <p className="text-xs text-red-600">
          {overage.toLocaleString()} overage minutes this period.
        </p>
      )}
    </div>
  )
}
