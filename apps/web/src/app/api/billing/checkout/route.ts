import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { PlanTier, BillingCycle } from "@voicecraft/db"
import { getStripe } from "@/lib/stripe"
import { getPlanByTier } from "@/lib/plans"
import { TRIAL_DAYS } from "@/lib/billing-constants"

const VALID_TIERS = Object.values(PlanTier) as string[]
const VALID_CYCLES = Object.values(BillingCycle) as string[]

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { tier, cycle } = body as Record<string, unknown>

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier)) {
    return Response.json(
      { error: `tier must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 }
    )
  }
  if (typeof cycle !== "string" || !VALID_CYCLES.includes(cycle)) {
    return Response.json(
      { error: `cycle must be one of: ${VALID_CYCLES.join(", ")}` },
      { status: 400 }
    )
  }

  try {
    const stripe = getStripe()
    const plan = await getPlanByTier(tier as PlanTier)
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 })
    }

    const flatPriceId =
      cycle === "ANNUAL" ? plan.stripePriceAnnual : plan.stripePriceMonthly
    const overagePriceId = plan.stripeOveragePrice

    // Ensure the user has a Stripe customer ID, creating one if necessary.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, stripeCustomerId: true },
    })
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    let stripeCustomerId = user.stripeCustomerId
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { voicecraftUserId: user.id },
      })
      stripeCustomerId = customer.id
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      })
    }

    // Check for an existing subscription so we can suppress the trial for
    // re-subscribing customers — they already used their trial period.
    const existingSub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true },
    })
    const isResubscribing =
      existingSub !== null &&
      (existingSub.status === "CANCELED" || existingSub.status === "PAUSED")

    if (!isResubscribing) {
      // ── First-time user: create trial subscription directly (no card required) ──
      // No Stripe Checkout — we create the subscription server-side with a trial
      // period. The user never sees a payment form until the trial ends.
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [
          { price: flatPriceId },
          { price: overagePriceId },
        ],
        trial_period_days: TRIAL_DAYS,
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        metadata: {
          voicecraftUserId: user.id,
          planTier: tier,
          billingCycle: cycle,
        },
      })

      // Create local subscription record (webhook will upsert if it arrives later)
      const periodStart = subscription.items.data[0]?.current_period_start
      const periodEnd = subscription.items.data[0]?.current_period_end

      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: subscription.id },
        update: {
          status: "TRIALING",
          stripePriceId: flatPriceId,
          planTier: plan.tier,
          billingCycle: cycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
          currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : new Date(),
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
        create: {
          userId: user.id,
          planId: plan.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: flatPriceId,
          status: "TRIALING",
          planTier: plan.tier,
          billingCycle: cycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
          currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : new Date(),
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          usageRecords: {
            create: {
              userId: user.id,
              periodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
              periodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
              minutesIncluded: plan.minutesIncluded,
              maxAgents: plan.maxAgents,
              overagePerMinute: plan.overagePerMinute,
            },
          },
        },
      })

      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionVersion: { increment: 1 } },
      })

      // No redirect to Stripe — send user straight to the dashboard
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
      return Response.json({ url: `${appUrl}/dashboard?checkout=success` })
    }

    // ── Re-subscribing user: use Stripe Checkout (card required, no trial) ──
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        { price: flatPriceId, quantity: 1 },
        { price: overagePriceId },
      ],
      subscription_data: {
        metadata: {
          voicecraftUserId: user.id,
          planTier: tier,
          billingCycle: cycle,
        },
      },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard/choose-plan`,
    })

    return Response.json({ url: checkoutSession.url })
  } catch (err) {
    console.error("[POST /api/billing/checkout]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
