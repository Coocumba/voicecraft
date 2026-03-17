import { auth } from "@/auth"
import { canProvisionNumbers, searchAvailableNumbers } from "@/lib/twilio"

/**
 * GET — Search Twilio for available phone numbers (read-only, no purchase).
 *
 * Query params: areaCode, contains, locality, region, limit
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canProvisionNumbers()) {
    return Response.json(
      { error: "Phone provisioning is not available — Twilio is not configured" },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const areaCode = searchParams.get("areaCode") ?? undefined
  const contains = searchParams.get("contains") ?? undefined
  const locality = searchParams.get("locality") ?? undefined
  const region = searchParams.get("region") ?? undefined
  const limitStr = searchParams.get("limit")

  // Validate area code: exactly 3 digits
  if (areaCode && !/^\d{3}$/.test(areaCode)) {
    return Response.json({ error: "areaCode must be exactly 3 digits" }, { status: 400 })
  }

  // Validate region: 2 uppercase letters
  if (region && !/^[A-Z]{2}$/.test(region)) {
    return Response.json({ error: "region must be a 2-letter state code (e.g. CA)" }, { status: 400 })
  }

  // Sanitize contains: strip non-alphanumeric except *, max 20 chars, auto-wrap with wildcards
  let sanitizedContains: string | undefined
  if (contains) {
    const cleaned = contains.replace(/[^a-zA-Z0-9*]/g, "").slice(0, 20)
    if (cleaned.length > 0) {
      sanitizedContains = cleaned.includes("*") ? cleaned : `*${cleaned}*`
    }
  }

  // Parse limit
  let limit = 20
  if (limitStr) {
    const parsed = parseInt(limitStr, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
      limit = parsed
    }
  }

  try {
    const numbers = await searchAvailableNumbers({
      areaCode,
      contains: sanitizedContains,
      locality,
      region,
      limit,
    })

    return Response.json({ numbers })
  } catch (err) {
    console.error("[GET /api/phone-numbers/search]", err)
    const message = err instanceof Error ? err.message : "Search failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
