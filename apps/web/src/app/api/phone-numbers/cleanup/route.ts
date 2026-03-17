import { cleanupStaleNumbers } from "@/lib/phone-pool"

const DEFAULT_MAX_AGE_DAYS = 25

/**
 * POST — Release Twilio numbers that have been sitting AVAILABLE in the pool
 * for longer than maxAgeDays. Intended to be called by a cron job or
 * scheduler. Protected by the shared VOICECRAFT_API_KEY.
 *
 * Body (optional): { maxAgeDays?: number }
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-api-key")
  // Explicit falsy check on apiKey ensures we reject requests that arrive with
  // no header at all, even if VOICECRAFT_API_KEY is accidentally undefined.
  if (!apiKey || apiKey !== process.env.VOICECRAFT_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let maxAgeDays = DEFAULT_MAX_AGE_DAYS

  try {
    const body = (await request.json()) as { maxAgeDays?: unknown }
    if (body.maxAgeDays !== undefined) {
      if (
        typeof body.maxAgeDays !== "number" ||
        !Number.isInteger(body.maxAgeDays) ||
        body.maxAgeDays < 1
      ) {
        return Response.json(
          { error: "maxAgeDays must be a positive integer" },
          { status: 400 }
        )
      }
      maxAgeDays = body.maxAgeDays
    }
  } catch {
    // No body or invalid JSON — maxAgeDays stays at default. That's fine,
    // the field is optional.
  }

  try {
    const result = await cleanupStaleNumbers(maxAgeDays)
    return Response.json({ cleaned: result.cleaned })
  } catch (err) {
    console.error("[POST /api/phone-numbers/cleanup]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
