/**
 * Convert a local datetime string to a UTC Date using Intl.
 * Handles DST correctly by using Intl-based resolution, not fixed offset arithmetic.
 *
 * @param localDateTimeStr  e.g. "2026-03-21T09:00:00"
 * @param timezone          IANA timezone, e.g. "America/Chicago"
 * @param dayOffset         Offset in days from the parsed date (0 = same day, 1 = next day)
 */
export function toUTC(
  localDateTimeStr: string,
  timezone: string,
  dayOffset = 0
): Date {
  const dtParts = localDateTimeStr.split("T")
  const datePart = dtParts[0] ?? ""
  const timePart = dtParts[1] ?? "00:00:00"
  const dateParts = datePart.split("-")
  const timeParts = timePart.split(":")

  const year = parseInt(dateParts[0] ?? "0", 10)
  const month = parseInt(dateParts[1] ?? "0", 10)
  const day = parseInt(dateParts[2] ?? "0", 10) + dayOffset
  const hour = parseInt(timeParts[0] ?? "0", 10)
  const minute = parseInt(timeParts[1] ?? "0", 10)
  const second = parseInt(timeParts[2] ?? "0", 10)

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(guess)
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10)

  const localAtGuess = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  )

  const offsetMs = localAtGuess.getTime() - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

/**
 * Get the lowercase day name for a date in a given timezone.
 * e.g. getDayName("2026-03-21", "America/Chicago") => "saturday"
 */
export function getDayName(dateStr: string, timezone: string): string {
  const utcDate = toUTC(`${dateStr}T12:00:00`, timezone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
  return formatter.format(utcDate).toLowerCase()
}

/**
 * Validate that a string is a recognized IANA timezone.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Read the user's IANA timezone from the `timezone` cookie.
 * Falls back to UTC if the cookie is missing or invalid.
 * Must be called in a Server Component / Route Handler (uses `next/headers`).
 */
export async function getUserTimezone(): Promise<string> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const raw = cookieStore.get('timezone')?.value
  const tz = raw ? decodeURIComponent(raw) : undefined
  if (tz && isValidTimezone(tz)) return tz
  return 'UTC'
}

/**
 * Get the start-of-today as a UTC Date in the user's local timezone.
 * e.g. if user is in America/New_York and it's 2026-03-20T01:00 local,
 * this returns the UTC instant corresponding to 2026-03-20T00:00 in New York.
 */
export function startOfDayInTimezone(timezone: string, now?: Date): Date {
  const d = now ?? new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA formats as YYYY-MM-DD
  const localDateStr = formatter.format(d)
  return toUTC(`${localDateStr}T00:00:00`, timezone)
}

/**
 * Get the current hour in the user's timezone (0-23).
 */
export function currentHourInTimezone(timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })
  return parseInt(formatter.format(new Date()), 10)
}
