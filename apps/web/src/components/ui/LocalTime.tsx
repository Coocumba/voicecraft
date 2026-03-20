'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface LocalTimeProps {
  date: Date | string
  format?: 'date' | 'datetime'
  className?: string
}

/**
 * Renders a date/time in the user's local timezone.
 * Shows a non-breaking space during SSR to avoid hydration mismatch
 * (server runs UTC, client runs local timezone).
 */
export function LocalTime({ date, format = 'datetime', className }: LocalTimeProps) {
  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (format === 'date') {
      setFormatted(
        d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      )
    } else {
      setFormatted(
        d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      )
    }
  }, [date, format])

  return (
    <time
      className={cn('inline-block min-w-[8rem]', className)}
      dateTime={typeof date === 'string' ? date : date.toISOString()}
    >
      {formatted ?? '\u00A0'}
    </time>
  )
}
