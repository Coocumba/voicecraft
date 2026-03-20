import { auth } from "@/auth"
import { getUserSubscription, getCurrentUsageRecord } from "@/lib/subscription"
import { TRIAL_MINUTES } from "@/lib/billing-constants"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Fetch subscription first, then pass its id to getCurrentUsageRecord so the
    // latter skips its own redundant subscription lookup.
    const subscription = await getUserSubscription(session.user.id)
    const usageRecord = subscription
      ? await getCurrentUsageRecord(session.user.id, subscription.id)
      : null

    if (!subscription) {
      return Response.json({ error: "No active subscription found" }, { status: 404 })
    }

    const isTrialing = subscription.status === "TRIALING"
    // During trial the included minutes are capped at the trial allowance
    // regardless of what the selected plan nominally includes.
    const minutesIncluded = isTrialing
      ? TRIAL_MINUTES
      : (usageRecord?.minutesIncluded ?? subscription.plan.minutesIncluded)

    return Response.json({
      plan: {
        tier: subscription.planTier,
        name: subscription.plan.name,
        cycle: subscription.billingCycle,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEnd: subscription.trialEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      usage: {
        minutesUsed: usageRecord?.minutesUsed ?? 0,
        minutesIncluded,
        overagePerMinute:
          usageRecord?.overagePerMinute ?? subscription.plan.overagePerMinute,
      },
    })
  } catch (err) {
    console.error("[GET /api/billing/usage]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
