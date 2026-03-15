// Server-side environment variable validation.
//
// IMPORTANT: Import this file only from route handlers and server actions —
// never at module level in files that participate in static generation, because
// env vars are not available at build time.
//
// Missing required vars throw immediately so the process fails fast.
// Missing optional vars emit a console warning so operators notice during start-up.

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

function optional(key: string): string | undefined {
  const value = process.env[key]
  if (!value && typeof window === "undefined") {
    console.warn(`[env] Missing optional env var: ${key}`)
  }
  return value
}

export const env = {
  // Required — the app cannot function without these.
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET: required("AUTH_SECRET"),

  // Optional — missing values degrade specific features but do not crash the server.
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),
  LIVEKIT_URL: optional("LIVEKIT_URL"),
  LIVEKIT_API_KEY: optional("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: optional("LIVEKIT_API_SECRET"),
  VOICECRAFT_API_KEY: optional("VOICECRAFT_API_KEY"),
} as const
