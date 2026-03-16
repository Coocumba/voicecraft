interface ProgressDotsProps {
  total: number
  current: number
}

function progressHint(remaining: number): string {
  if (remaining <= 0) return 'All set!'
  if (remaining === 1) return '1 question left'
  if (remaining <= 3) return `${remaining} questions left`
  return 'A few questions to go'
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  const remaining = total - current

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${current} of ${total} topics covered`}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={
              i < current
                ? 'w-2 h-2 rounded-full bg-accent transition-colors'
                : 'w-2 h-2 rounded-full border border-border bg-transparent transition-colors'
            }
            aria-hidden="true"
          />
        ))}
      </div>
      {current > 0 && (
        <span className="text-xs text-muted hidden sm:inline">
          {progressHint(remaining)}
        </span>
      )}
    </div>
  )
}
