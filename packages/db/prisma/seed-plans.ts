import { PrismaClient, PlanTier } from "@prisma/client"

/**
 * Upserts the 3 plan tiers into the Plan table.
 *
 * Stripe price IDs are from the Stripe Dashboard. They are not secrets —
 * they're public product identifiers, so they live directly in code.
 *
 * To update: change the IDs below, run `npx prisma db seed`.
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
      stripePriceMonthly: "price_1TD8UdKFFbrvd46zwNXXzoqz",
      stripePriceAnnual: "price_1TD8UdKFFbrvd46zd4i8safe",
      stripeOveragePrice: "price_1TD8Z8KFFbrvd46zTmiSAZnj",
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
      stripePriceMonthly: "price_1TD8UdKFFbrvd46zEN0SUY5U",
      stripePriceAnnual: "price_1TD8UdKFFbrvd46z2xzvegxU",
      stripeOveragePrice: "price_1TD8a2KFFbrvd46zDrMXucyU",
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
      stripePriceMonthly: "price_1TD8UdKFFbrvd46ztt7SQfNV",
      stripePriceAnnual: "price_1TD8UdKFFbrvd46z2xzvegxU",
      stripeOveragePrice: "price_1TD8b3KFFbrvd46zxvUPk27b",
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
