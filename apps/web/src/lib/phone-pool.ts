/**
 * Phone Number Pool
 *
 * Manages a shared pool of Twilio phone numbers so that released numbers can
 * be re-assigned to new agents without incurring an additional Twilio purchase.
 *
 * Candidate selection order inside acquireNumber:
 *   1. AVAILABLE + same userId + matching areaCode  (user's own recycled number)
 *   2. AVAILABLE + any userId   + matching areaCode  (shared pool, area match)
 *   3. AVAILABLE + any                              (only when no areaCode requested)
 *   4. No match → purchase a new number from Twilio
 *
 * Race-condition safety:
 *   Each pool claim is guarded by an `updateMany` WHERE status=AVAILABLE AND id=<id>.
 *   If the row was already claimed by a concurrent request the count will be 0 and
 *   we move on to the next candidate rather than failing.
 */

import { prisma, PhoneNumberStatus } from "@voicecraft/db"
import type { PhoneNumber } from "@voicecraft/db"
import {
  purchasePhoneNumber,
  releasePhoneNumber,
  configureNumberVoiceWebhook,
  configureNumberSmsWebhook,
} from "@/lib/twilio"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcquireResult {
  phoneNumber: string
  sid: string
  /** true when a pooled number was reused; false when a new one was purchased */
  fromPool: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assign a phone number to an agent, reusing a pooled number when possible.
 *
 * Fires cleanupStaleNumbers() as a non-blocking side-effect on every call so
 * that the pool is gradually pruned without requiring a separate cron job.
 */
export async function acquireNumber(
  agentId: string,
  userId: string,
  areaCode?: string,
  poolNumberId?: string
): Promise<AcquireResult> {
  // Fire-and-forget; never let cleanup failures surface to callers.
  void cleanupStaleNumbers().catch((err: unknown) => {
    console.error("[phone-pool] cleanupStaleNumbers error (ignored):", err)
  })

  // If a specific pool number was requested, try to claim it directly.
  if (poolNumberId) {
    const directClaim = await prisma.$transaction(async (tx) => {
      const { count } = await tx.phoneNumber.updateMany({
        where: {
          id: poolNumberId,
          status: PhoneNumberStatus.AVAILABLE,
        },
        data: {
          status: PhoneNumberStatus.ASSIGNED,
          agentId,
          userId,
          assignedAt: new Date(),
          releasedAt: null,
        },
      })
      if (count === 0) return null
      return tx.phoneNumber.findUnique({ where: { id: poolNumberId } })
    })

    if (directClaim) {
      await configureWebhookIfProduction(directClaim.twilioSid)
      console.info(
        `[phone-pool] assigned requested pool number ${directClaim.number} (sid=${directClaim.twilioSid}) to agent ${agentId}`
      )
      return { phoneNumber: directClaim.number, sid: directClaim.twilioSid, fromPool: true }
    }
    // If the requested pool number was already taken, fall through to normal flow.
  }

  // Attempt to claim a pooled number using the priority order described above.
  const claimed = await claimFromPool(agentId, userId, areaCode)
  if (claimed) {
    const sid = claimed.twilioSid
    await configureWebhookIfProduction(sid)
    console.info(
      `[phone-pool] assigned pooled number ${claimed.number} (sid=${sid}) to agent ${agentId}`
    )
    return { phoneNumber: claimed.number, sid, fromPool: true }
  }

  // No pooled number available — purchase a fresh one from Twilio.
  const purchased = await purchasePhoneNumber(areaCode)

  await prisma.phoneNumber.create({
    data: {
      number: purchased.phoneNumber,
      twilioSid: purchased.sid,
      areaCode: extractAreaCode(purchased.phoneNumber) ?? areaCode,
      status: PhoneNumberStatus.ASSIGNED,
      agentId,
      userId,
      assignedAt: new Date(),
    },
  })

  await configureWebhookIfProduction(purchased.sid)

  console.info(
    `[phone-pool] purchased new number ${purchased.phoneNumber} (sid=${purchased.sid}) for agent ${agentId}`
  )
  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, fromPool: false }
}

/**
 * Soft-release a number back to the pool.
 *
 * Does NOT call Twilio — the number stays on the account so it can be
 * re-assigned cheaply. Hard deletion happens lazily via cleanupStaleNumbers.
 */
export async function releaseNumber(
  agentId: string
): Promise<{ released: boolean; number: string | null }> {
  const record = await prisma.phoneNumber.findUnique({ where: { agentId } })

  if (!record) {
    console.info(`[phone-pool] releaseNumber: no number found for agent ${agentId}`)
    return { released: false, number: null }
  }

  // Clear Twilio webhooks so the released number doesn't route to VoiceCraft
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl && !appUrl.includes("localhost")) {
    try {
      await configureNumberVoiceWebhook(record.twilioSid, "")
    } catch (err) {
      console.error(`[phone-pool] Failed to clear voice webhook for ${record.number}`, err)
    }
    try {
      await configureNumberSmsWebhook(record.twilioSid, null)
    } catch (err) {
      console.error(`[phone-pool] Failed to clear SMS webhook for ${record.number}`, err)
    }
  }

  await prisma.phoneNumber.update({
    where: { id: record.id },
    data: {
      status: PhoneNumberStatus.AVAILABLE,
      agentId: null,
      releasedAt: new Date(),
    },
  })

  console.info(
    `[phone-pool] released number ${record.number} from agent ${agentId} back to pool`
  )
  return { released: true, number: record.number }
}

/**
 * Move an ASSIGNED number from one agent to another without going through
 * the pool lookup — useful for agent re-deploys or ownership transfers.
 */
export async function reassignNumber(
  phoneNumberId: string,
  toAgentId: string,
  userId: string
): Promise<PhoneNumber> {
  const record = await prisma.phoneNumber.findUnique({ where: { id: phoneNumberId } })

  if (!record) {
    throw new Error(`[phone-pool] reassignNumber: PhoneNumber ${phoneNumberId} not found`)
  }

  if (record.status !== PhoneNumberStatus.ASSIGNED) {
    throw new Error(
      `[phone-pool] reassignNumber: PhoneNumber ${phoneNumberId} is not ASSIGNED (status=${record.status})`
    )
  }

  const updated = await prisma.phoneNumber.update({
    where: { id: phoneNumberId },
    data: {
      agentId: toAgentId,
      userId,
      assignedAt: new Date(),
      // status stays ASSIGNED
    },
  })

  console.info(
    `[phone-pool] reassigned number ${record.number} from agent ${record.agentId ?? "(none)"} to agent ${toAgentId}`
  )
  return updated
}

/**
 * Release stale pooled numbers from the Twilio account and remove them from
 * the database.  Numbers that have been AVAILABLE for longer than maxAgeDays
 * are unlikely to be reclaimed and incur monthly Twilio charges.
 *
 * Each record is cleaned independently so a single Twilio failure does not
 * abort the entire sweep.
 */
export async function cleanupStaleNumbers(maxAgeDays = 25): Promise<{ cleaned: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)

  const stale = await prisma.phoneNumber.findMany({
    where: {
      status: PhoneNumberStatus.AVAILABLE,
      releasedAt: { lt: cutoff },
    },
    select: { id: true, number: true, twilioSid: true },
  })

  if (stale.length === 0) return { cleaned: 0 }

  console.info(`[phone-pool] cleanupStaleNumbers: found ${stale.length} stale number(s) to clean`)

  let cleaned = 0

  for (const record of stale) {
    try {
      await releasePhoneNumber(record.twilioSid)
      await prisma.phoneNumber.delete({ where: { id: record.id } })
      console.info(`[phone-pool] cleaned stale number ${record.number} (sid=${record.twilioSid})`)
      cleaned++
    } catch (err: unknown) {
      // Log and continue — one bad record must not block the rest.
      console.error(
        `[phone-pool] failed to clean number ${record.number} (sid=${record.twilioSid}):`,
        err
      )
    }
  }

  return { cleaned }
}

/**
 * Return AVAILABLE numbers from the pool, optionally filtered by area code.
 *
 * Ordering: the requesting user's own numbers first, then by most recently
 * released (hot numbers are more likely to have an active webhook config).
 */
export async function getAvailableNumbers(
  userId: string,
  areaCode?: string
): Promise<PhoneNumber[]> {
  const records = await prisma.phoneNumber.findMany({
    where: {
      status: PhoneNumberStatus.AVAILABLE,
      ...(areaCode ? { areaCode } : {}),
    },
    orderBy: [
      // Prisma doesn't support conditional ORDER BY, so we sort in JS after
      // fetching — the result set is expected to be small (pool idle numbers).
    ],
  })

  // Sort: user's own numbers first, then by releasedAt descending.
  records.sort((a, b) => {
    const aOwned = a.userId === userId ? 0 : 1
    const bOwned = b.userId === userId ? 0 : 1
    if (aOwned !== bOwned) return aOwned - bOwned

    const aTime = a.releasedAt?.getTime() ?? 0
    const bTime = b.releasedAt?.getTime() ?? 0
    return bTime - aTime // descending
  })

  return records
}

/**
 * Extract a local area/region code from an E.164 number.
 * US/Canada (+1): returns 3-digit area code
 * Other countries: returns first 2-4 digits after country code (or null)
 */
export function extractAreaCode(e164: string): string | null {
  // US/Canada: "+1" + 10 digits
  if (/^\+1\d{10}$/.test(e164)) return e164.slice(2, 5)

  // UK: "+44" + 10 digits, area code is first 2-4 digits after 44
  if (/^\+44\d{10}$/.test(e164)) return e164.slice(3, 7)

  // India: "+91" + 10 digits, no standard area code for mobile
  if (/^\+91\d{10}$/.test(e164)) return e164.slice(3, 6)

  // Australia: "+61" + 9 digits
  if (/^\+61\d{9}$/.test(e164)) return e164.slice(3, 5)

  // Generic: try to extract first 3 digits after country code
  const match = e164.match(/^\+\d{1,3}(\d{3})/)
  if (match) return match[1] ?? null

  return null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk through the priority-ordered list of AVAILABLE candidates and
 * atomically claim the first one that has not already been taken by a
 * concurrent caller.
 *
 * The optimistic lock is: UPDATE PhoneNumber SET status=ASSIGNED ... WHERE id=? AND status=AVAILABLE
 * If `count` comes back 0 the row was claimed between our SELECT and UPDATE;
 * we skip to the next candidate.
 */
async function claimFromPool(
  agentId: string,
  userId: string,
  areaCode?: string
): Promise<PhoneNumber | null> {
  const candidates = await buildCandidateList(userId, areaCode)

  for (const candidate of candidates) {
    // Optimistic claim inside a transaction so the guard and the full update
    // are atomic.  If count===0 someone else grabbed it; move on.
    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.phoneNumber.updateMany({
        where: {
          id: candidate.id,
          status: PhoneNumberStatus.AVAILABLE, // guard against concurrent claim
        },
        data: {
          status: PhoneNumberStatus.ASSIGNED,
          agentId,
          userId,
          assignedAt: new Date(),
          releasedAt: null,
        },
      })

      if (count === 0) return null

      // Re-fetch to return the fully-hydrated record.
      return tx.phoneNumber.findUnique({ where: { id: candidate.id } })
    })

    if (result) return result
  }

  return null
}

interface PoolCandidate {
  id: string
  number: string
  twilioSid: string
}

/**
 * Build a prioritized candidate list without claiming anything.
 *
 * Priority:
 *   1. Same userId + matching areaCode
 *   2. Any userId  + matching areaCode  (only when areaCode provided)
 *   3. Any AVAILABLE                    (only when no areaCode requested)
 */
async function buildCandidateList(
  userId: string,
  areaCode?: string
): Promise<PoolCandidate[]> {
  if (areaCode) {
    // Fetch both priority tiers in one query, differentiate in JS.
    const rows = await prisma.phoneNumber.findMany({
      where: { status: PhoneNumberStatus.AVAILABLE, areaCode },
      select: { id: true, number: true, twilioSid: true, userId: true, releasedAt: true },
      orderBy: { releasedAt: "desc" },
    })

    // Tier 1: same user; Tier 2: any other user — preserve releasedAt order within each tier.
    const tier1 = rows.filter((r) => r.userId === userId)
    const tier2 = rows.filter((r) => r.userId !== userId)
    return [...tier1, ...tier2]
  }

  // No area code requested: any AVAILABLE number will do.
  return prisma.phoneNumber.findMany({
    where: { status: PhoneNumberStatus.AVAILABLE },
    select: { id: true, number: true, twilioSid: true },
    orderBy: { releasedAt: "desc" },
  })
}

async function configureWebhookIfProduction(sid: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl && !appUrl.includes("localhost")) {
    await configureNumberVoiceWebhook(sid, `${appUrl}/api/webhooks/twilio-voice`)
  }
}
