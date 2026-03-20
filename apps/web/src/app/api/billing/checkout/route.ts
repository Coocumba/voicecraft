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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: flatPriceId,
          quantity: 1,
        },
        {
          price: overagePriceId,
          // Metered/overage prices are quantity-less — Stripe infers usage from
          // usage records reported against the subscription item.
        },
      ],
      subscription_data: {
        ...(!isResubscribing ? { trial_period_days: TRIAL_DAYS } : {}),
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
