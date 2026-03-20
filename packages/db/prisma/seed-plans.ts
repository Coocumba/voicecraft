import { PrismaClient, PlanTier } from "@prisma/client"

/**
 * Upserts the 3 plan tiers into the Plan table.
 *
 * Stripe price IDs are placeholders — replace with real IDs from the Stripe
 * Dashboard after creating the Product and Prices there.
 *
 * Prices are stored in cents:
 *   monthlyPrice        — flat monthly charge
 *   annualPricePerMonth — display value (price / 12), shown on pricing page
 *   annualPriceTotal    — actual annual charge sent to Stripe
 *   overagePerMinute    — cents per minute over the included quota
 */
export async function seedPlans(prisma: PrismaClient): Promise<void> {
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
      stripePriceMonthly: "price_starter_monthly_placeholder",
      stripePriceAnnual: "price_starter_annual_placeholder",
      stripeOveragePrice: "price_starter_overage_placeholder",
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
      stripePriceMonthly: "price_growth_monthly_placeholder",
      stripePriceAnnual: "price_growth_annual_placeholder",
      stripeOveragePrice: "price_growth_overage_placeholder",
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
      stripePriceMonthly: "price_professional_monthly_placeholder",
      stripePriceAnnual: "price_professional_annual_placeholder",
      stripeOveragePrice: "price_professional_overage_placeholder",
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
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
    console.log(`Seeded plan: ${plan.name}`)
  }
}
