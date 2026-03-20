import { prisma } from "@voicecraft/db"
import type { Plan, Subscription, SubscriptionStatus } from "@voicecraft/db"
import { PlanTier } from "@voicecraft/db"
import { TRIAL_MAX_AGENTS } from "@/lib/billing-constants"

/**
 * Fetch a plan by its tier enum value.
 * Returns null if the Plan table has not been seeded yet.
 */
export async function getPlanByTier(tier: PlanTier): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { tier } })
}

/**
 * Fetch a plan by a Stripe price ID.
 *
 * Checks both the monthly and annual price columns — a Stripe subscription
 * carries only its active price ID, and we need to map that back to a plan
 * regardless of billing cycle.
 *
 * Returns null if no plan matches (e.g., price ID not yet seeded).
 */
export async function getPlanByStripePriceId(
  stripePriceId: string
): Promise<Plan | null> {
  return prisma.plan.findFirst({
    where: {
      OR: [
        { stripePriceMonthly: stripePriceId },
        { stripePriceAnnual: stripePriceId },
      ],
    },
  })
}

/**
 * Derive the effective agent cap for a user based on their subscription state.
 *
 * Rules (in priority order):
 * 1. No subscription → 0 agents allowed.
 * 2. TRIALING → capped at TRIAL_MAX_AGENTS regardless of chosen tier.
 * 3. Downgrade scheduled (cancelAtPeriodEnd + pendingPlanTier set) →
 *    use the *incoming* plan's maxAgents so users cannot pre-create agents
 *    that would exceed the new limit.
 * 4. Otherwise → use the current plan's maxAgents.
 *
 * The subscription must be loaded with its plan relation included.
 */
export async function getEffectiveMaxAgents(
  subscription: (Subscription & { plan: Plan }) | null
): Promise<number> {
  if (!subscription) {
    return 0
  }

  const status = subscription.status as SubscriptionStatus

  if (status === "TRIALING") {
    return TRIAL_MAX_AGENTS
  }

  if (subscription.cancelAtPeriodEnd && subscription.pendingPlanTier !== null) {
    const pendingPlan = await getPlanByTier(
      subscription.pendingPlanTier as PlanTier
    )
    // If lookup fails (data integrity issue), fall through to current plan.
    if (pendingPlan !== null) {
      return pendingPlan.maxAgents
    }
  }

  return subscription.plan.maxAgents
}
