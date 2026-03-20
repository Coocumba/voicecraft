import { prisma } from "@voicecraft/db"
import { TRIAL_MINUTES } from "./billing-constants"

/** Atomically increment minutesUsed and return the updated value. */
export async function incrementUsage(
  subscriptionId: string,
  periodStart: Date,
  durationSeconds: number
): Promise<{ minutesUsed: number; minutesIncluded: number } | null> {
  const minutes = Math.ceil(durationSeconds / 60)
  if (minutes <= 0) return null

  const record = await prisma.usageRecord.update({
    where: {
      subscriptionId_periodStart: { subscriptionId, periodStart },
    },
    data: {
      minutesUsed: { increment: minutes },
    },
    select: { minutesUsed: true, minutesIncluded: true },
  })

  return record
}

type UsageThreshold = { percent: number; label: string }

const THRESHOLDS: UsageThreshold[] = [
  { percent: 150, label: "150%" },
  { percent: 100, label: "100%" },
  { percent: 80, label: "80%" },
]

/** Check if a threshold was just crossed. Returns the crossed threshold or null. */
export function checkThresholdCrossed(
  prevMinutes: number,
  newMinutes: number,
  includedMinutes: number
): UsageThreshold | null {
  for (const threshold of THRESHOLDS) {
    const limit = Math.floor(includedMinutes * (threshold.percent / 100))
    if (prevMinutes < limit && newMinutes >= limit) {
      return threshold
    }
  }
  return null
}

/** Check if trial minutes are exhausted. */
export function isTrialMinutesExhausted(minutesUsed: number): boolean {
  return minutesUsed >= TRIAL_MINUTES
}
