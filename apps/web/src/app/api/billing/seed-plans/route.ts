import { prisma, PlanTier } from "@voicecraft/db"

/**
 * POST /api/billing/seed-plans
 *
 * Seeds or updates the Plan table with Stripe price IDs from environment
 * variables. Protected by VOICECRAFT_API_KEY (same secret used by the
 * agent worker). Safe to call multiple times — uses upsert.
 *
 * This exists because the seed script runs locally where Railway env vars
 * are not available. This route runs inside the deployed app where
 * STRIPE_PRICE_* env vars are set.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-api-key")
  if (apiKey !== process.env.VOICECRAFT_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const plans = [
    {
      tier: PlanTier.STARTER,
      name: "Starter",
      monthlyPrice: 4900,
      annualPricePerMonth: 3900,
      annualPriceTotal: 46800,
      minutesIncluded: 500,
      overagePerMinute: 5,
      maxAgents: 1,
      stripePriceMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
      stripePriceAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "",
      stripeOveragePrice: process.env.STRIPE_PRICE_STARTER_OVERAGE ?? "",
    },
    {
      tier: PlanTier.GROWTH,
      name: "Growth",
      monthlyPrice: 9900,
      annualPricePerMonth: 8400,
      annualPriceTotal: 100800,
      minutesIncluded: 1500,
      overagePerMinute: 4,
      maxAgents: 3,
      stripePriceMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "",
      stripePriceAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "",
      stripeOveragePrice: process.env.STRIPE_PRICE_GROWTH_OVERAGE ?? "",
    },
    {
      tier: PlanTier.PROFESSIONAL,
      name: "Professional",
      monthlyPrice: 24900,
      annualPricePerMonth: 20900,
      annualPriceTotal: 250800,
      minutesIncluded: 5000,
      overagePerMinute: 3,
      maxAgents: 10,
      stripePriceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
      stripePriceAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
      stripeOveragePrice: process.env.STRIPE_PRICE_PRO_OVERAGE ?? "",
    },
  ]

  // Validate all price IDs are set
  const missing: string[] = []
  for (const plan of plans) {
    if (!plan.stripePriceMonthly) missing.push(`STRIPE_PRICE_${plan.tier}_MONTHLY`)
    if (!plan.stripePriceAnnual) missing.push(`STRIPE_PRICE_${plan.tier}_ANNUAL`)
    if (!plan.stripeOveragePrice) missing.push(`STRIPE_PRICE_${plan.tier}_OVERAGE`)
  }
  // Professional uses PRO prefix in env vars
  const fixedMissing = missing.map((m) => m.replace("PROFESSIONAL", "PRO"))

  if (fixedMissing.length > 0) {
    return Response.json(
      { error: "Missing environment variables", missing: fixedMissing },
      { status: 400 }
    )
  }

  const results = []
  for (const plan of plans) {
    const result = await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        monthlyPrice: plan.monthlyPrice,
        annualPricePerMonth: plan.annualPricePerMonth,
        annualPriceTotal: plan.annualPriceTotal,
        minutesIncluded: plan.minutesIncluded,
        overagePerMinute: plan.overagePerMinute,
        maxAgents: plan.maxAgents,
        stripePriceMonthly: plan.stripePriceMonthly,
        stripePriceAnnual: plan.stripePriceAnnual,
        stripeOveragePrice: plan.stripeOveragePrice,
      },
      create: plan,
    })
    results.push({ tier: result.tier, name: result.name, id: result.id })
  }

  return Response.json({ ok: true, plans: results })
}
