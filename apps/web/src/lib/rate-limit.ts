// In-memory token bucket rate limiter.
//
// Each identifier (e.g. user ID) gets its own bucket. Tokens refill linearly
// over the window duration. This is intentionally simple — a Redis-backed
// implementation (e.g. Upstash) should replace this for multi-instance deployments.
//
// The bucket map is module-level; it persists for the lifetime of the Node.js
// process and is NOT shared across serverless function instances.

interface Bucket {
  tokens: number
  lastRefill: number // epoch ms
}

interface RateLimitResult {
  success: boolean
  remaining: number
}

interface RateLimitOptions {
  /** Maximum number of requests allowed per window. */
  limit: number
  /** Window duration in milliseconds. */
  windowMs: number
}

const buckets = new Map<string, Bucket>()

/**
 * Check whether `identifier` is within the configured rate limit.
 *
 * Returns `{ success: true, remaining }` when the request is allowed, or
 * `{ success: false, remaining: 0 }` when the bucket is empty.
 */
export function rateLimit(
  identifier: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now()

  let bucket = buckets.get(identifier)

  if (!bucket) {
    // First request from this identifier — start with a full bucket minus one token.
    bucket = { tokens: limit - 1, lastRefill: now }
    buckets.set(identifier, bucket)
    return { success: true, remaining: limit - 1 }
  }

  // Refill tokens proportionally to elapsed time.
  const elapsed = now - bucket.lastRefill
  const refill = (elapsed / windowMs) * limit
  bucket.tokens = Math.min(limit, bucket.tokens + refill)
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    return { success: false, remaining: 0 }
  }

  bucket.tokens -= 1
  return { success: true, remaining: Math.floor(bucket.tokens) }
}
