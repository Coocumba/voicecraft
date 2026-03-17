import { toUTC } from "@/lib/timezone-utils"

/**
 * Generate appointment slot start times within a business-hours window.
 * Slots are spaced at `durationMinutes` intervals from `open` to `close - duration`.
 * Returns UTC ISO strings (Z suffix).
 *
 * @param dateStr         Date in YYYY-MM-DD format
 * @param open            Opening time in HH:MM format (local)
 * @param close           Closing time in HH:MM format (local)
 * @param durationMinutes Slot duration (default 30)
 * @param timezone        IANA timezone string
 */
export function generateSlots(
  dateStr: string,
  open: string,
  close: string,
  durationMinutes: number,
  timezone: string
): string[] {
  const openParts = open.split(":")
  const closeParts = close.split(":")

  const openH = Number(openParts[0] ?? "0")
  const openM = Number(openParts[1] ?? "0")
  const closeH = Number(closeParts[0] ?? "0")
  const closeM = Number(closeParts[1] ?? "0")

  const openTotal = openH * 60 + openM
  const closeTotal = closeH * 60 + closeM

  const lastSlotStart = closeTotal - durationMinutes

  const slots: string[] = []

  for (let mins = openTotal; mins <= lastSlotStart; mins += durationMinutes) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    const localTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
    const utcDate = toUTC(`${dateStr}T${localTime}`, timezone)
    slots.push(utcDate.toISOString())
  }

  return slots
}
