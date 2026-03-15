// CORS helper for webhook routes that are called by the Python agent service.
//
// The allowed origin defaults to the AGENT_ORIGIN env var, which should be
// set to the agent's base URL (e.g. http://agent:8000 in docker-compose).
// When the var is absent all origins are permitted — acceptable for
// internal service-to-service webhooks where auth is handled via API key.

const AGENT_ORIGIN = process.env.AGENT_ORIGIN ?? "*"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": AGENT_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
}

/**
 * Append CORS headers to an existing Headers instance (or create a new one).
 * Returns a new Headers object — the original is not mutated.
 */
export function withCors(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    result.set(key, value)
  }
  return result
}

/**
 * Build a 204 No Content preflight response with the appropriate CORS headers.
 */
export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: withCors() })
}
