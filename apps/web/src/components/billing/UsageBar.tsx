import { cn } from '@/lib/utils'

interface UsageBarProps {
  used: number
  included: number
}

export function UsageBar({ used, included }: UsageBarProps) {
  const percentage = included > 0 ? Math.min((used / included) * 100, 100) : 0
  const isOver = used > included
  const isWarning = !isOver && percentage > 80

  const barColor = isOver
    ? 'bg-red-500'
    : isWarning
      ? 'bg-yellow-400'
      : 'bg-accent'

  return (
    <div className="h-1.5 bg-border/60 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', barColor)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
