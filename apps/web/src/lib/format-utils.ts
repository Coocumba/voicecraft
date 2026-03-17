/** Format E.164 number to readable US format if applicable */
export function formatPhone(number: string): string {
  const match = number.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (match) return `+1 (${match[1]}) ${match[2]}-${match[3]}`
  return number
}

/** Format locality + region into a display string like "San Francisco, CA" */
export function formatLocation(
  locality: string | null | undefined,
  region: string | null | undefined
): string | null {
  if (locality && region) return `${locality}, ${region}`
  if (locality) return locality
  if (region) return region
  return null
}
