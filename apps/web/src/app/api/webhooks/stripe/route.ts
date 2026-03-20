import { NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@voicecraft/db"
import { getPlanByStripePriceId } from "@/lib/plans"
import { pauseUserAgents, resumeUserAgents } from "@/lib/subscription"
import type Stripe from "stripe"

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature or webhook secret", { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err)
    return new Response("Invalid signature", { status: 400 })
  }

  // Idempotency: attempt to insert the event record before any processing.
  // If two webhook deliveries arrive simultaneously, only one will succeed the
  // INSERT — the other will hit the unique constraint (P2002) and return 200
  // immediately, preventing double-processing without a separate read query.
  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === "P2002") {
      // Already processed — idempotent success
      return new Response("Already processed", { status: 200 })
    }
    console.error("[Stripe Webhook] Failed to record event:", err)
    return new Response("Internal server error", { status: 500 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break
      default:
        // Unhandled event type — log and ignore
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    // Log error but still return 200 to prevent Stripe retries on bad logic.
    // Stripe will not retry on 2xx responses; errors here indicate application
    // bugs that must be investigated, not transient failures.
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err)
  }

  return new Response("OK", { status: 200 })
}

/**
 * In Stripe API 2026-02-25.clover, current_period_start/end moved from the
 * Subscription object to the SubscriptionItem level. Extract the billing period
 * from the first item, falling back to billing_cycle_anchor + created if missing.
 */
function extractSubscriptionPeriod(sub: Stripe.Subscription): {
  periodStart: Date
  periodEnd: Date
} {
  const item = sub.items.data[0]
  if (item?.current_period_start && item?.current_period_end) {
    return {
      periodStart: new Date(item.current_period_start * 1000),
      periodEnd: new Date(item.current_period_end * 1000),
    }
  }
  // Fallback: use billing_cycle_anchor as period start and trial_end as period
  // end for trialing subscriptions. For non-trialing, use created.
  const periodStart = new Date(sub.billing_cycle_anchor * 1000)
  const periodEnd = sub.trial_end
    ? new Date(sub.trial_end * 1000)
    : new Date(sub.billing_cycle_anchor * 1000)
  return { periodStart, periodEnd }
}

async function handleSubscriptionCreated(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  })
  if (!user) {
    console.error(`[Stripe Webhook] No user found for customer ${customerId}`)
    return
  }

  const priceId = sub.items.data[0]?.price?.id
  if (!priceId) return

  const plan = await getPlanByStripePriceId(priceId)
  if (!plan) {
    console.error(`[Stripe Webhook] No plan found for price ${priceId}`)
    return
  }

  const isAnnual = priceId === plan.stripePriceAnnual
  const status = sub.status === "trialing" ? "TRIALING" : "ACTIVE"
  const { periodStart, periodEnd } = extractSubscriptionPeriod(sub)

  // Upsert — record may already exist if the checkout API pre-created it
  const upsertedSub = await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    update: {
      status,
      stripePriceId: priceId,
      planTier: plan.tier,
      billingCycle: isAnnual ? "ANNUAL" : "MONTHLY",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
    create: {
      userId: user.id,
      planId: plan.id,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      status,
      planTier: plan.tier,
      billingCycle: isAnnual ? "ANNUAL" : "MONTHLY",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      usageRecords: {
        create: {
          userId: user.id,
          periodStart,
          periodEnd,
          minutesIncluded: plan.minutesIncluded,
          maxAgents: plan.maxAgents,
          overagePerMinute: plan.overagePerMinute,
        },
      },
    },
  })

  // Ensure the current period has a UsageRecord regardless of whether this was
  // an insert or update path (e.g. subscription pre-created by checkout API).
  await prisma.usageRecord.upsert({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: upsertedSub.id,
        periodStart,
      },
    },
    update: {},
    create: {
      userId: user.id,
      subscriptionId: upsertedSub.id,
      periodStart,
      periodEnd,
      minutesIncluded: plan.minutesIncluded,
      maxAgents: plan.maxAgents,
      overagePerMinute: plan.overagePerMinute,
    },
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionVersion: { increment: 1 } },
  })
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existingSub) return

  const priceId = sub.items.data[0]?.price?.id
  const plan = priceId ? await getPlanByStripePriceId(priceId) : null

  // Map Stripe statuses to local enum values.
  // Stripe's past_due, unpaid, and paused all map to PAUSED (agents halted, not
  // canceled) since payment may recover. Only explicit deletion maps to CANCELED.
  const LAPSED_STATUSES = ["past_due", "canceled", "unpaid", "paused"]
  let localStatus = existingSub.status
  if (sub.status === "trialing") localStatus = "TRIALING"
  else if (sub.status === "active") localStatus = "ACTIVE"
  else if (LAPSED_STATUSES.includes(sub.status)) localStatus = "PAUSED"

  const { periodStart, periodEnd } = extractSubscriptionPeriod(sub)

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: {
      status: localStatus,
      stripePriceId: priceId ?? existingSub.stripePriceId,
      planTier: plan?.tier ?? existingSub.planTier,
      planId: plan?.id ?? existingSub.planId,
      billingCycle:
        priceId && plan
          ? priceId === plan.stripePriceAnnual
            ? "ANNUAL"
            : "MONTHLY"
          : existingSub.billingCycle,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  })

  // Pause agents if the subscription has just become lapsed
  if (LAPSED_STATUSES.includes(sub.status) && existingSub.status !== "PAUSED") {
    await pauseUserAgents(existingSub.userId)
  }

  await prisma.user.update({
    where: { id: existingSub.userId },
    data: { subscriptionVersion: { increment: 1 } },
  })
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existingSub) return

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: { status: "CANCELED" },
  })

  await pauseUserAgents(existingSub.userId)

  await prisma.user.update({
    where: { id: existingSub.userId },
    data: { subscriptionVersion: { increment: 1 } },
  })
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // In API 2026-02-25.clover, the subscription reference moved from
  // invoice.subscription to invoice.parent.subscription_details.subscription
  const subId = (() => {
    const details = invoice.parent?.subscription_details
    if (!details) return null
    return typeof details.subscription === "string"
      ? details.subscription
      : details.subscription?.id ?? null
  })()
  if (!subId) return

  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
    include: { plan: true },
  })
  if (!existingSub) return

  const wasLapsed =
    existingSub.status === "PAST_DUE" || existingSub.status === "PAUSED"

  // Derive the new billing period from the invoice line item so that
  // currentPeriodStart/End stay accurate even when the subscription object
  // arrives slightly later than the invoice event.
  const lineItem = invoice.lines?.data?.[0]
  const periodStart = lineItem?.period?.start
    ? new Date(lineItem.period.start * 1000)
    : existingSub.currentPeriodStart
  const periodEnd = lineItem?.period?.end
    ? new Date(lineItem.period.end * 1000)
    : existingSub.currentPeriodEnd

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  })

  // Create usage record for the new billing period (idempotent via unique constraint)
  await prisma.usageRecord.upsert({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: existingSub.id,
        periodStart,
      },
    },
    update: {},
    create: {
      userId: existingSub.userId,
      subscriptionId: existingSub.id,
      periodStart,
      periodEnd,
      minutesIncluded: existingSub.plan.minutesIncluded,
      maxAgents: existingSub.plan.maxAgents,
      overagePerMinute: existingSub.plan.overagePerMinute,
    },
  })

  if (wasLapsed) {
    await resumeUserAgents(existingSub.userId)
  }

  await prisma.user.update({
    where: { id: existingSub.userId },
    data: { subscriptionVersion: { increment: 1 } },
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId = (() => {
    const details = invoice.parent?.subscription_details
    if (!details) return null
    return typeof details.subscription === "string"
      ? details.subscription
      : details.subscription?.id ?? null
  })()
  if (!subId) return

  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
  })
  if (!existingSub) return

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: { status: "PAST_DUE" },
  })

  await prisma.user.update({
    where: { id: existingSub.userId },
    data: { subscriptionVersion: { increment: 1 } },
  })

  // TODO: Send dunning email via Resend
}

async function handleTrialWillEnd(sub: Stripe.Subscription) {
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existingSub) return

  // TODO: Send "trial ending in 3 days" email via Resend
  console.log(
    `[Stripe Webhook] Trial ending soon for user ${existingSub.userId}`
  )
}
