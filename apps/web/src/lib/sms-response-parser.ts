export interface SmsLlmResponse {
  reply: string
  handoff: boolean
  action: "check_availability" | "book" | "cancel" | null
  actionData?: Record<string, string>
}

const FALLBACK_RESPONSE: SmsLlmResponse = {
  reply: "Thanks for your message! We'll get back to you shortly.",
  handoff: true,
  action: null,
}

export function parseSmsResponse(raw: string): SmsLlmResponse {
  // Strategy 1: direct JSON.parse
  try {
    const parsed = JSON.parse(raw)
    if (isValidResponse(parsed)) return parsed
  } catch { /* continue */ }

  // Strategy 2: extract from markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch && fenceMatch[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1])
      if (isValidResponse(parsed)) return parsed
    } catch { /* continue */ }
  }

  // Strategy 3: first { to last }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      if (isValidResponse(parsed)) return parsed
    } catch { /* continue */ }
  }

  // Strategy 4: fallback
  return FALLBACK_RESPONSE
}

function isValidResponse(obj: unknown): obj is SmsLlmResponse {
  if (typeof obj !== "object" || obj === null) return false
  const r = obj as Record<string, unknown>
  return typeof r.reply === "string" && typeof r.handoff === "boolean"
}
