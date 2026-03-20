'use client'

import { useEffect } from 'react'

/**
 * Sets a `timezone` cookie from the browser so server components
 * can compute timezone-aware date boundaries (e.g. start-of-day).
 * The cookie is HttpOnly=false so it's readable via `cookies()`.
 */
export function TimezoneSync() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    // Only set if changed (avoids writing on every render)
    if (!document.cookie.includes(`timezone=${tz}`)) {
      document.cookie = `timezone=${tz};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
    }
  }, [])

  return null
}
