/** Format E.164 number to a readable format */
export function formatPhone(number: string): string {
  // US/Canada: +1 (XXX) XXX-XXXX
  const usMatch = number.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (usMatch) return `+1 (${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`

  // UK: +44 XXXX XXXXXX
  const ukMatch = number.match(/^\+44(\d{4})(\d{6})$/)
  if (ukMatch) return `+44 ${ukMatch[1]} ${ukMatch[2]}`

  // India: +91 XXXXX XXXXX
  const inMatch = number.match(/^\+91(\d{5})(\d{5})$/)
  if (inMatch) return `+91 ${inMatch[1]} ${inMatch[2]}`

  // Australia: +61 X XXXX XXXX
  const auMatch = number.match(/^\+61(\d)(\d{4})(\d{4})$/)
  if (auMatch) return `+61 ${auMatch[1]} ${auMatch[2]} ${auMatch[3]}`

  // Generic international: insert space after country code (first 1-3 digits after +)
  const genericMatch = number.match(/^\+(\d{1,3})(\d+)$/)
  if (genericMatch) {
    const countryCode = genericMatch[1] as string
    const rest = genericMatch[2] as string
    // Group remaining digits in chunks of 3-4
    const chunks = rest.match(/.{1,4}/g) ?? [rest]
    return `+${countryCode} ${chunks.join(' ')}`
  }

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
