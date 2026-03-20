# Subscription & Billing System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-powered subscriptions with 3 tiers, per-minute usage billing, 14-day free trials, and enforcement of agent/minute limits.

**Architecture:** Stripe is source of truth for subscription lifecycle. Local DB caches state via webhooks, owns plan definitions and enforcement. JWT carries subscription status for middleware; API routes enforce limits via direct DB reads. Usage is tracked locally and batched to Stripe Billing Meters.

**Tech Stack:** Stripe (`stripe` npm package), Prisma, NextAuth v5, Next.js App Router, Tailwind CSS, Resend (for alert emails)

**Spec:** `docs/superpowers/specs/2026-03-20-subscription-billing-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/web/src/lib/stripe.ts` | Stripe client singleton |
| `apps/web/src/lib/billing-constants.ts` | Client-safe constants: `TRIAL_MINUTES`, `TRIAL_DAYS`, `TRIAL_MAX_AGENTS` (no Prisma imports) |
| `apps/web/src/lib/plans.ts` | Server-side plan helpers: get plan limits, enforcement helpers (imports Prisma) |
| `apps/web/src/lib/usage.ts` | Atomic usage increment, threshold checking, alert queueing |
| `apps/web/src/lib/subscription.ts` | Subscription helpers — get user subscription, check status, derive plan from price ID |
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler (signature verification, event dispatch) |
| `apps/web/src/app/api/billing/checkout/route.ts` | Create Stripe Checkout session for plan selection |
| `apps/web/src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal session |
| `apps/web/src/app/api/billing/usage/route.ts` | Get current usage for dashboard |
| `apps/web/src/app/dashboard/(focused)/choose-plan/page.tsx` | Plan selection page (server component wrapper) |
| `apps/web/src/components/billing/ChoosePlanClient.tsx` | Plan selection client component with billing toggle |
| `apps/web/src/components/billing/PlanCard.tsx` | Reusable plan card component |
| `apps/web/src/components/billing/BillingSection.tsx` | Plan & Billing section for settings page |
| `apps/web/src/components/billing/UsageBar.tsx` | Usage progress bar component |
| `apps/web/src/components/billing/SubscriptionBanner.tsx` | Trial/paused/past-due banners for dashboard |
| `packages/db/prisma/seed-plans.ts` | Seed Plan table with 3 tiers |

### Modified files
| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add Plan, Subscription, UsageRecord, StripeEvent models, enums, extend User and AgentStatus |
| `packages/db/src/index.ts` | Export new enums and types |
| `packages/db/prisma/seed.ts` | Import and call plan seeding |
| `apps/web/src/auth.ts` | Add subscription status + planTier + subscriptionVersion to JWT and session |
| `apps/web/src/middleware.ts` | Add subscription check, redirect to choose-plan |
| `apps/web/src/app/api/agents/route.ts` | Enforce agent count limit on POST |
| `apps/web/src/app/api/agents/[id]/deploy/route.ts` | Check subscription status before deploy |
| `apps/web/src/app/api/calls/route.ts` | Increment UsageRecord after call logged |
| `apps/web/src/app/dashboard/(shell)/settings/page.tsx` | Add Plan & Billing section |
| `apps/web/src/app/dashboard/(shell)/layout.tsx` | Add SubscriptionBanner |
| `apps/web/.env.example` | Add STRIPE_* vars |
| `apps/web/src/app/pricing/page.tsx` | Update "Extra agents" row to "Contact us", add USD note |

---

## Chunk 1: Database Schema, Stripe Client, Plan Constants

### Task 1: Extend Prisma schema with billing models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add new enums after existing enums (after line 127)**

After the `ConversationStatus` enum block, add:

```prisma
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

enum PlanTier {
  STARTER
  GROWTH
  PROFESSIONAL
}

enum BillingCycle {
  MONTHLY
  ANNUAL
}
```

- [ ] **Step 2: Add PAUSED to AgentStatus enum (line 106–110)**

Replace the existing `AgentStatus` enum:

```prisma
enum AgentStatus {
  DRAFT
  ACTIVE
  INACTIVE
  PAUSED
}
```

- [ ] **Step 3: Extend User model (lines 10–25)**

Replace the User model with:

```prisma
model User {
  id                      String                  @id @default(cuid())
  email                   String                  @unique
  name                    String?
  passwordHash            String?
  emailVerified           DateTime?
  stripeCustomerId        String?                 @unique
  subscriptionVersion     Int                     @default(0)
  agents                  Agent[]
  conversations           BuilderConversation[]
  integrations            Integration[]
  contacts                Contact[]
  phoneNumbers            PhoneNumber[]
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
  subscription            Subscription?
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt
}
```

- [ ] **Step 4: Add Plan, Subscription, UsageRecord, StripeEvent models**

Add these after the PasswordResetToken model (at end of file):

```prisma
// ── Billing ─────────────────────────────────────────────────────────────────

model Plan {
  id                  String         @id @default(cuid())
  tier                PlanTier       @unique
  name                String
  monthlyPrice        Int
  annualPricePerMonth Int
  annualPriceTotal    Int
  minutesIncluded     Int
  overagePerMinute    Int
  maxAgents           Int
  stripePriceMonthly  String
  stripePriceAnnual   String
  stripeOveragePrice  String
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  subscriptions       Subscription[]
}

model Subscription {
  id                   String             @id @default(cuid())
  userId               String             @unique
  user                 User               @relation(fields: [userId], references: [id])
  planId               String
  plan                 Plan               @relation(fields: [planId], references: [id])
  stripeSubscriptionId String             @unique
  stripePriceId        String
  status               SubscriptionStatus
  planTier             PlanTier
  billingCycle         BillingCycle
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  trialStart           DateTime?
  trialEnd             DateTime?
  cancelAtPeriodEnd    Boolean            @default(false)
  pendingPlanTier      PlanTier?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  usageRecords         UsageRecord[]
}

model UsageRecord {
  id                  String       @id @default(cuid())
  userId              String
  subscriptionId      String
  subscription        Subscription @relation(fields: [subscriptionId], references: [id])
  periodStart         DateTime
  periodEnd           DateTime
  minutesUsed         Int          @default(0)
  lastReportedMinutes Int          @default(0)
  minutesIncluded     Int
  maxAgents           Int
  overagePerMinute    Int
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  @@unique([subscriptionId, periodStart])
  @@index([userId])
}

model StripeEvent {
  id          String   @id
  type        String
  processedAt DateTime @default(now())

  @@index([processedAt])
}
```

- [ ] **Step 5: Run migration**

```bash
cd packages/db && npx prisma migrate dev --name add-billing-models
```

Expected: Migration created and applied successfully.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): add billing models — Plan, Subscription, UsageRecord, StripeEvent"
```

---

### Task 2: Export new enums and types from @voicecraft/db

**Files:**
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Update enum exports (line 19)**

Replace line 19:

```ts
export { AgentStatus, CallOutcome, AppointmentStatus, ConversationStatus, IntegrationProvider, PhoneNumberStatus, MessageChannel, MessageDirection, MessageSender, MessagingStatus, WhatsAppStatus, SubscriptionStatus, PlanTier, BillingCycle } from "@prisma/client"
```

- [ ] **Step 2: Update type exports (line 20)**

Replace line 20:

```ts
export type { User, Agent, Call, Appointment, BuilderConversation, Integration, Contact, PhoneNumber, Conversation, Message, Plan, Subscription, UsageRecord, StripeEvent, Prisma } from "@prisma/client"
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd packages/db && npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(db): export billing enums and types"
```

---

### Task 3: Seed Plan table

**Files:**
- Create: `packages/db/prisma/seed-plans.ts`
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Create seed-plans.ts**

```ts
import { PrismaClient, PlanTier } from "@prisma/client"

export async function seedPlans(prisma: PrismaClient) {
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
      stripePriceMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "price_starter_monthly",
      stripePriceAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "price_starter_annual",
      stripeOveragePrice: process.env.STRIPE_PRICE_STARTER_OVERAGE ?? "price_starter_overage",
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
      stripePriceMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "price_growth_monthly",
      stripePriceAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "price_growth_annual",
      stripeOveragePrice: process.env.STRIPE_PRICE_GROWTH_OVERAGE ?? "price_growth_overage",
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
      stripePriceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_pro_monthly",
      stripePriceAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "price_pro_annual",
      stripeOveragePrice: process.env.STRIPE_PRICE_PRO_OVERAGE ?? "price_pro_overage",
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: plan,
      create: plan,
    })
  }

  console.log("Seeded 3 plans: Starter, Growth, Professional")
}
```

- [ ] **Step 2: Update seed.ts to call seedPlans**

Add import at line 2 and call after user creation. Replace full file:

```ts
import { PrismaClient } from "@prisma/client"
import { hashSync } from "bcryptjs"
import { seedPlans } from "./seed-plans"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@voicecraft.dev"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed user already exists: ${email}`)
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash: hashSync("password123", 10),
        emailVerified: new Date(),
      },
    })
    console.log(`Seeded demo user: ${email} / password123`)
  }

  await seedPlans(prisma)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 3: Run seed**

```bash
cd packages/db && npx prisma db seed
```

Expected: "Seeded 3 plans: Starter, Growth, Professional"

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed-plans.ts packages/db/prisma/seed.ts
git commit -m "feat(db): seed plan table with 3 tiers"
```

---

### Task 4: Stripe client singleton and plan constants

**Files:**
- Create: `apps/web/src/lib/stripe.ts`
- Create: `apps/web/src/lib/billing-constants.ts`
- Create: `apps/web/src/lib/plans.ts`

- [ ] **Step 1: Create Stripe client singleton**

```ts
import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
})
```

- [ ] **Step 2: Create client-safe billing constants (no Prisma imports)**

`apps/web/src/lib/billing-constants.ts`:

```ts
// These constants are safe to import in client components — no server-side dependencies.
export const TRIAL_MINUTES = 60
export const TRIAL_DAYS = 14
export const TRIAL_MAX_AGENTS = 1
```

- [ ] **Step 3: Create server-side plan helpers (imports Prisma)**

`apps/web/src/lib/plans.ts`:

```ts
import { prisma, PlanTier } from "@voicecraft/db"
import { TRIAL_MAX_AGENTS } from "./billing-constants"

/** Fetch the Plan row for a given tier. */
export async function getPlanByTier(tier: PlanTier) {
  return prisma.plan.findUnique({ where: { tier } })
}

/** Look up a Plan by its Stripe price ID (monthly or annual). */
export async function getPlanByStripePriceId(stripePriceId: string) {
  return prisma.plan.findFirst({
    where: {
      OR: [
        { stripePriceMonthly: stripePriceId },
        { stripePriceAnnual: stripePriceId },
      ],
    },
  })
}

/** Get the effective max agents for a user, considering trial and pending downgrade. */
export async function getEffectiveMaxAgents(userId: string): Promise<number> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })

  if (!subscription) return 0

  if (subscription.status === "TRIALING") return TRIAL_MAX_AGENTS

  // If a downgrade is pending, cap at the incoming plan's limit
  if (subscription.cancelAtPeriodEnd && subscription.pendingPlanTier) {
    const pendingPlan = await getPlanByTier(subscription.pendingPlanTier)
    if (pendingPlan) return pendingPlan.maxAgents
  }

  return subscription.plan.maxAgents
}
```

- [ ] **Step 4: Install stripe package**

```bash
cd apps/web && pnpm add stripe
```

- [ ] **Step 5: Add env vars to .env.example**

Append after line 55 of `apps/web/.env.example`:

```
# Stripe (subscription billing)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

- [ ] **Step 6: Type check**

```bash
pnpm type-check
```

Expected: Pass

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/stripe.ts apps/web/src/lib/billing-constants.ts apps/web/src/lib/plans.ts apps/web/.env.example apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add Stripe client, plan constants, and env vars"
```

---

## Chunk 2: Auth, Middleware, Subscription Helpers, Webhook Handler

### Task 5: Add subscription status to JWT and session

**Files:**
- Modify: `apps/web/src/auth.ts`

- [ ] **Step 1: Extend the module declaration (lines 7–11)**

Replace with:

```ts
declare module "next-auth" {
  interface User {
    emailVerified?: Date | null
    subscriptionStatus?: string | null
    planTier?: string | null
    subscriptionVersion?: number
  }
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      emailVerified: Date | null
      subscriptionStatus: string | null
      planTier: string | null
    }
  }
}
```

- [ ] **Step 2: Update JWT callback (lines 86–95)**

Replace the jwt callback:

```ts
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.emailVerified = (user as { emailVerified?: Date | null }).emailVerified ?? null
      }

      // Fetch subscription on sign-in OR refresh stale data on token rotation
      const userId = (user?.id ?? token.id) as string | undefined
      if (userId && (user || trigger === "update" || !token.subscriptionStatus)) {
        const [sub, dbUser] = await Promise.all([
          prisma.subscription.findUnique({
            where: { userId },
            select: { status: true, planTier: true },
          }),
          prisma.user.findUnique({
            where: { id: userId },
            select: { subscriptionVersion: true },
          }),
        ])
        token.subscriptionStatus = sub?.status ?? null
        token.planTier = sub?.planTier ?? null
        token.subscriptionVersion = dbUser?.subscriptionVersion ?? 0
      }

      if (trigger === "update" && typeof session?.name === "string") {
        token.name = session.name
      }
      return token
    },
```

- [ ] **Step 3: Update session callback (lines 97–108)**

Replace the session callback:

```ts
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        if (typeof token.name === "string") {
          session.user.name = token.name
        }
        session.user.emailVerified = token.emailVerified
          ? new Date(token.emailVerified as string)
          : null
        session.user.subscriptionStatus = (token.subscriptionStatus as string) ?? null
        session.user.planTier = (token.planTier as string) ?? null
      }
      return session
    },
```

- [ ] **Step 4: Type check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth.ts
git commit -m "feat(auth): add subscription status and plan tier to JWT/session"
```

---

### Task 6: Update middleware for subscription check

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Replace middleware (full file)**

```ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const session = req.auth
  const { pathname } = req.nextUrl

  const isDashboard = pathname.startsWith("/dashboard")
  if (!isDashboard) return NextResponse.next()

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (!session.user?.emailVerified) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl))
  }

  // Subscription check — exempt choose-plan page to avoid redirect loop
  // Also exempt the seeded demo user for local development
  const isChoosePlan = pathname.startsWith("/dashboard/choose-plan")
  const isDemoUser = session.user.email === "admin@voicecraft.dev"
  if (!isChoosePlan && !isDemoUser && !session.user.subscriptionStatus) {
    return NextResponse.redirect(new URL("/dashboard/choose-plan", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*"],
}
```

- [ ] **Step 2: Type check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(middleware): redirect users without subscription to choose-plan"
```

---

### Task 7: Subscription helper library

**Files:**
- Create: `apps/web/src/lib/subscription.ts`

- [ ] **Step 1: Create subscription helpers**

```ts
import { prisma, SubscriptionStatus } from "@voicecraft/db"

const LAPSED_STATUSES: SubscriptionStatus[] = ["PAUSED", "CANCELED"]
const BLOCKED_STATUSES: SubscriptionStatus[] = ["PAUSED", "CANCELED"]

/** Get user's subscription with plan included. Returns null if none. */
export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
}

/** Get the current billing period's usage record for a user. */
export async function getCurrentUsageRecord(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  })
  if (!subscription) return null

  return prisma.usageRecord.findFirst({
    where: {
      subscriptionId: subscription.id,
      periodStart: { lte: new Date() },
      periodEnd: { gte: new Date() },
    },
    orderBy: { periodStart: "desc" },
  })
}

/** Check if the user's subscription allows the action. */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return !LAPSED_STATUSES.includes(status)
}

/** Check if the subscription blocks agent creation/deployment. */
export function isSubscriptionBlocked(status: SubscriptionStatus): boolean {
  return BLOCKED_STATUSES.includes(status)
}

/** Pause all active agents for a user (tear down dispatch rules). */
export async function pauseUserAgents(userId: string) {
  await prisma.agent.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "PAUSED" },
  })
  // TODO: Tear down LiveKit dispatch rules for each paused agent
  // This should be done as a background task in production
}

/** Resume paused agents for a user (re-create dispatch rules). */
export async function resumeUserAgents(userId: string) {
  await prisma.agent.updateMany({
    where: { userId, status: "PAUSED" },
    data: { status: "ACTIVE" },
  })
  // TODO: Re-create LiveKit dispatch rules for each resumed agent
  // This should be done as a background task in production
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/subscription.ts
git commit -m "feat: add subscription helper library"
```

---

### Task 8: Usage tracking library

**Files:**
- Create: `apps/web/src/lib/usage.ts`

- [ ] **Step 1: Create usage helpers**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/usage.ts
git commit -m "feat: add usage tracking library with atomic increment and threshold checks"
```

---

### Task 9: Stripe webhook handler

**Files:**
- Create: `apps/web/src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create the webhook route**

```ts
import { NextRequest } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@voicecraft/db"
import { getPlanByStripePriceId } from "@/lib/plans"
import { pauseUserAgents, resumeUserAgents } from "@/lib/subscription"
import type Stripe from "stripe"

export async function POST(request: NextRequest) {
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

  // Idempotency check
  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
  })
  if (existing) {
    return new Response("Already processed", { status: 200 })
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

    // Record processed event
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    })
  } catch (err) {
    // Log error but still return 200 to prevent Stripe retries on bad logic
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err)
  }

  return new Response("OK", { status: 200 })
}

async function handleSubscriptionCreated(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
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

  // Upsert — record may already exist from checkout API response
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    update: {
      status,
      stripePriceId: priceId,
      planTier: plan.tier,
      billingCycle: isAnnual ? "ANNUAL" : "MONTHLY",
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
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
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      usageRecords: {
        create: {
          userId: user.id,
          periodStart: new Date(sub.current_period_start * 1000),
          periodEnd: new Date(sub.current_period_end * 1000),
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
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existingSub) return

  const priceId = sub.items.data[0]?.price?.id
  const plan = priceId ? await getPlanByStripePriceId(priceId) : null

  // Map Stripe status to local status
  const LAPSED_STATUSES = ["past_due", "canceled", "unpaid", "paused"]
  let localStatus = existingSub.status
  if (sub.status === "trialing") localStatus = "TRIALING"
  else if (sub.status === "active") localStatus = "ACTIVE"
  else if (LAPSED_STATUSES.includes(sub.status)) localStatus = "PAUSED"

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: {
      status: localStatus,
      stripePriceId: priceId ?? existingSub.stripePriceId,
      planTier: plan?.tier ?? existingSub.planTier,
      planId: plan?.id ?? existingSub.planId,
      billingCycle: priceId && plan
        ? (priceId === plan.stripePriceAnnual ? "ANNUAL" : "MONTHLY")
        : existingSub.billingCycle,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  })

  // If status became lapsed, pause agents
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
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id
  if (!subId) return

  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
    include: { plan: true },
  })
  if (!existingSub) return

  const wasLapsed = existingSub.status === "PAST_DUE" || existingSub.status === "PAUSED"

  // Get period dates from invoice line item
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

  // Create usage record for new period (idempotent via unique constraint)
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
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id
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
  console.log(`[Stripe Webhook] Trial ending soon for user ${existingSub.userId}`)
}
```

- [ ] **Step 2: Type check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler with idempotent event processing"
```

---

## Chunk 3: Billing API Routes, Enforcement, Usage Tracking

### Task 10: Billing API — Checkout session

**Files:**
- Create: `apps/web/src/app/api/billing/checkout/route.ts`

- [ ] **Step 1: Create the checkout route**

```ts
import { auth } from "@/auth"
import { stripe } from "@/lib/stripe"
import { prisma, PlanTier } from "@voicecraft/db"
import { TRIAL_DAYS } from "@/lib/billing-constants"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json() as { tier: string; cycle: string }
  const { tier, cycle } = body

  if (!["STARTER", "GROWTH", "PROFESSIONAL"].includes(tier)) {
    return Response.json({ error: "Invalid plan tier" }, { status: 400 })
  }
  if (!["MONTHLY", "ANNUAL"].includes(cycle)) {
    return Response.json({ error: "Invalid billing cycle" }, { status: 400 })
  }

  const plan = await prisma.plan.findUnique({
    where: { tier: tier as PlanTier },
  })
  if (!plan) {
    return Response.json({ error: "Plan not found" }, { status: 404 })
  }

  // Ensure user has a Stripe customer
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 })
  }

  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const priceId = cycle === "ANNUAL" ? plan.stripePriceAnnual : plan.stripePriceMonthly

  // Check if user already has a subscription (re-subscribing after cancellation)
  const existingSub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  })

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      { price: priceId, quantity: 1 },
      { price: plan.stripeOveragePrice },
    ],
    subscription_data: existingSub
      ? undefined
      : { trial_period_days: TRIAL_DAYS },
    success_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard?checkout=success`,
    cancel_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/choose-plan`,
  })

  // NOTE: Do NOT create the local Subscription record here.
  // The Stripe subscription is only created after the user completes checkout.
  // The `customer.subscription.created` webhook handler will create/upsert
  // the local record when Stripe confirms the subscription.
  // The user will be redirected to choose-plan until the webhook fires (seconds).

  return Response.json({ url: checkoutSession.url })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/billing/checkout/route.ts
git commit -m "feat: add Stripe Checkout session API route"
```

---

### Task 11: Billing API — Customer Portal and Usage

**Files:**
- Create: `apps/web/src/app/api/billing/portal/route.ts`
- Create: `apps/web/src/app/api/billing/usage/route.ts`

- [ ] **Step 1: Create portal route**

```ts
import { auth } from "@/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@voicecraft/db"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.stripeCustomerId) {
    return Response.json({ error: "No billing account" }, { status: 400 })
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/settings`,
  })

  return Response.json({ url: portalSession.url })
}
```

- [ ] **Step 2: Create usage route**

```ts
import { auth } from "@/auth"
import { getCurrentUsageRecord, getUserSubscription } from "@/lib/subscription"
import { TRIAL_MINUTES } from "@/lib/plans"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const subscription = await getUserSubscription(session.user.id)
  if (!subscription) {
    return Response.json({ error: "No subscription" }, { status: 404 })
  }

  const usage = await getCurrentUsageRecord(session.user.id)

  const minutesIncluded = subscription.status === "TRIALING"
    ? TRIAL_MINUTES
    : (usage?.minutesIncluded ?? subscription.plan.minutesIncluded)

  return Response.json({
    plan: {
      tier: subscription.planTier,
      name: subscription.plan.name,
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
    usage: {
      minutesUsed: usage?.minutesUsed ?? 0,
      minutesIncluded,
      overagePerMinute: usage?.overagePerMinute ?? subscription.plan.overagePerMinute,
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/billing/portal/route.ts apps/web/src/app/api/billing/usage/route.ts
git commit -m "feat: add billing portal and usage API routes"
```

---

### Task 12: Enforce agent limits on creation

**Files:**
- Modify: `apps/web/src/app/api/agents/route.ts`

- [ ] **Step 1: Add enforcement to POST handler (after line 27)**

Insert between the auth check (line 27) and the body parsing (line 29). Add the import at the top and the enforcement block:

Add import at top of file (after line 2):

```ts
import { getEffectiveMaxAgents } from "@/lib/plans"
import { getUserSubscription } from "@/lib/subscription"
```

Insert after line 27 (`}`):

```ts
  // Enforce subscription and agent limits
  const subscription = await getUserSubscription(session.user.id)
  if (!subscription) {
    return Response.json({ error: "No active subscription" }, { status: 403 })
  }
  if (subscription.status === "PAUSED" || subscription.status === "CANCELED") {
    return Response.json({ error: "Your subscription is inactive. Please update your billing." }, { status: 403 })
  }

  const maxAgents = await getEffectiveMaxAgents(session.user.id)

  // Concurrency-safe agent count check — prevents two concurrent requests
  // from both reading below the limit and both inserting.
  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Agent"
    WHERE "userId" = ${session.user.id} AND "status" != 'INACTIVE'
    FOR UPDATE
  `
  if (Number(count) >= maxAgents) {
    return Response.json(
      { error: `You've reached your plan limit of ${maxAgents} agent${maxAgents === 1 ? "" : "s"}. Upgrade your plan to add more.` },
      { status: 403 }
    )
  }
```

- [ ] **Step 2: Type check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/agents/route.ts
git commit -m "feat: enforce agent count limits on agent creation"
```

---

### Task 13: Enforce subscription status on deployment

**Files:**
- Modify: `apps/web/src/app/api/agents/[id]/deploy/route.ts`

- [ ] **Step 1: Add subscription check in deploy handler**

Add import at top of file:

```ts
import { getUserSubscription } from "@/lib/subscription"
```

Insert subscription check **inside the `try` block**, after the session auth check and before the agent existence/ownership validation (around line 100). This ensures errors are caught by the existing error handler:

```ts
    // Check subscription status
    const subscription = await getUserSubscription(session.user.id)
    if (!subscription || subscription.status === "PAUSED" || subscription.status === "CANCELED") {
      return Response.json(
        { error: "Cannot deploy agents — your subscription is inactive." },
        { status: 403 }
      )
    }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/agents/[id]/deploy/route.ts
git commit -m "feat: check subscription status before agent deployment"
```

---

### Task 14: Track usage on call logging

**Files:**
- Modify: `apps/web/src/app/api/calls/route.ts`

- [ ] **Step 1: Add usage tracking after call creation**

Add imports at top of file:

```ts
import { incrementUsage, checkThresholdCrossed, isTrialMinutesExhausted } from "@/lib/usage"
```

Insert after the call creation (after line 144, before the contact upsert):

```ts
    // Track usage for billing — wrapped in own try/catch so billing
    // failures never prevent the call from being logged successfully.
    if (typeof duration === "number" && duration > 0) {
      try {
        const subscription = await prisma.subscription.findUnique({
          where: { userId: agent.userId },
        })
        if (subscription) {
          const prevUsage = await prisma.usageRecord.findFirst({
            where: {
              subscriptionId: subscription.id,
              periodStart: { lte: new Date() },
              periodEnd: { gte: new Date() },
            },
            select: { minutesUsed: true },
          })
          const prevMinutes = prevUsage?.minutesUsed ?? 0

          const result = await incrementUsage(
            subscription.id,
            subscription.currentPeriodStart,
            duration
          )

          if (result) {
            // Check for trial minute exhaustion
            if (subscription.status === "TRIALING" && isTrialMinutesExhausted(result.minutesUsed)) {
              // Pause the agent — trial minutes used up
              await prisma.agent.update({
                where: { id: agentId },
                data: { status: "PAUSED" },
              })
            }

            // Check usage thresholds for alerts (non-blocking)
            const threshold = checkThresholdCrossed(prevMinutes, result.minutesUsed, result.minutesIncluded)
            if (threshold) {
              // TODO: Queue alert email via Resend
              console.log(`[Usage Alert] User ${agent.userId} crossed ${threshold.label} threshold`)
            }
          }
        }
      } catch (usageErr) {
        console.error("[POST /api/calls] usage tracking failed (call still logged)", usageErr)
      }
    }
```

- [ ] **Step 2: Type check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/calls/route.ts
git commit -m "feat: track call usage and enforce trial minute limits"
```

---

## Chunk 4: UI — Choose Plan Page, Billing Settings, Subscription Banners, Pricing Page Update

### Task 15: Choose Plan page

**Files:**
- Create: `apps/web/src/app/dashboard/(focused)/choose-plan/page.tsx`
- Create: `apps/web/src/components/billing/ChoosePlanClient.tsx`
- Create: `apps/web/src/components/billing/PlanCard.tsx`

- [ ] **Step 1: Create the server component wrapper**

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@voicecraft/db"
import { ChoosePlanClient } from "@/components/billing/ChoosePlanClient"

export default async function ChoosePlanPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  // If user already has an active subscription, redirect to dashboard
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  })
  if (subscription && subscription.status !== "CANCELED") {
    redirect("/dashboard")
  }

  const plans = await prisma.plan.findMany({
    orderBy: { monthlyPrice: "asc" },
  })

  return <ChoosePlanClient plans={plans} />
}
```

- [ ] **Step 2: Create PlanCard component**

```tsx
"use client"

interface PlanCardProps {
  name: string
  description: string
  price: number // cents
  cycle: string
  minutes: string
  calls: string
  overage: string
  agents: string
  highlight: boolean
  ctaLabel: string
  onSelect: () => void
  loading: boolean
  annualTotal?: number // cents, for annual display
}

export function PlanCard({
  name,
  description,
  price,
  cycle,
  minutes,
  calls,
  overage,
  agents,
  highlight,
  ctaLabel,
  onSelect,
  loading,
  annualTotal,
}: PlanCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border p-6 sm:p-8 flex flex-col ${
        highlight
          ? "border-accent ring-2 ring-accent relative"
          : "border-border"
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-xs font-medium text-white bg-accent px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <div className="mb-5">
        <h3 className="font-serif text-xl text-ink mb-1">{name}</h3>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      </div>
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-4xl text-ink">
            ${(price / 100).toFixed(0)}
          </span>
          <span className="text-sm text-muted">/mo</span>
        </div>
        {cycle === "ANNUAL" && annualTotal && (
          <p className="text-xs text-muted mt-1">
            Billed annually (${(annualTotal / 100).toFixed(0)}/yr)
          </p>
        )}
      </div>
      <button
        onClick={onSelect}
        disabled={loading}
        className={`w-full px-6 py-3 text-sm font-medium rounded-xl transition-colors mb-6 disabled:opacity-50 ${
          highlight
            ? "bg-accent text-white hover:bg-accent/90"
            : "bg-ink text-white hover:bg-ink/90"
        }`}
      >
        {loading ? "Loading…" : ctaLabel}
      </button>
      <ul className="space-y-3 text-sm">
        {[
          `${minutes} minutes/mo (${calls})`,
          `${agents} voice agent${agents === "1" ? "" : "s"}`,
          `${overage}/min overage`,
          "All features included",
          "14-day free trial",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-ink">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Create ChoosePlanClient component**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlanCard } from "./PlanCard"
import type { Plan } from "@voicecraft/db"

const PLAN_DESCRIPTIONS: Record<string, { description: string; calls: string }> = {
  STARTER: { description: "For solo practitioners getting started with AI reception.", calls: "~150 calls" },
  GROWTH: { description: "For growing practices that handle more volume.", calls: "~450 calls" },
  PROFESSIONAL: { description: "For busy multi-location or high-volume businesses.", calls: "~1,500 calls" },
}

export function ChoosePlanClient({ plans }: { plans: Plan[] }) {
  const [annual, setAnnual] = useState(false)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const router = useRouter()

  async function handleSelect(plan: Plan) {
    setLoadingTier(plan.tier)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: plan.tier,
          cycle: annual ? "ANNUAL" : "MONTHLY",
        }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        router.push(data.url)
      } else {
        console.error("Checkout error:", data.error)
        setLoadingTier(null)
      }
    } catch {
      setLoadingTier(null)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-ink mb-3">
          Choose your plan
        </h1>
        <p className="text-muted text-base">
          Start with a 14-day free trial. No credit card required.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={`text-sm ${!annual ? "text-ink font-medium" : "text-muted"}`}>
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            annual ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              annual ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm ${annual ? "text-ink font-medium" : "text-muted"}`}>
          Annual
        </span>
        {annual && (
          <span className="text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-2 py-0.5 rounded-full">
            Save 20%
          </span>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl w-full">
        {plans.map((plan) => {
          const meta = PLAN_DESCRIPTIONS[plan.tier] ?? { description: "", calls: "" }
          return (
            <PlanCard
              key={plan.id}
              name={plan.name}
              description={meta.description}
              price={annual ? plan.annualPricePerMonth : plan.monthlyPrice}
              cycle={annual ? "ANNUAL" : "MONTHLY"}
              minutes={plan.minutesIncluded.toLocaleString()}
              calls={meta.calls}
              overage={`$${(plan.overagePerMinute / 100).toFixed(2)}`}
              agents={plan.maxAgents.toString()}
              highlight={plan.tier === "GROWTH"}
              ctaLabel="Start free trial"
              onSelect={() => void handleSelect(plan)}
              loading={loadingTier === plan.tier}
              annualTotal={plan.annualPriceTotal}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/\(focused\)/choose-plan/ apps/web/src/components/billing/
git commit -m "feat: add choose-plan page with plan cards and Stripe checkout flow"
```

---

### Task 16: Subscription banner for dashboard

**Files:**
- Create: `apps/web/src/components/billing/SubscriptionBanner.tsx`
- Modify: `apps/web/src/app/dashboard/(shell)/layout.tsx`

- [ ] **Step 1: Create SubscriptionBanner**

```tsx
"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"

export function SubscriptionBanner() {
  const { data: session } = useSession()
  const status = session?.user?.subscriptionStatus

  if (!status) return null

  if (status === "TRIALING") {
    return (
      <div className="bg-accent/8 border-b border-accent/20 px-4 py-2 text-center text-sm text-accent">
        You&apos;re on a free trial.{" "}
        <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
          Add a payment method
        </Link>{" "}
        to keep your agent active after the trial.
      </div>
    )
  }

  if (status === "PAUSED" || status === "CANCELED") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-sm text-red-700">
        Your subscription is inactive. Your agents are paused.{" "}
        <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
          Reactivate your plan
        </Link>
      </div>
    )
  }

  if (status === "PAST_DUE") {
    return (
      <div className="bg-yellow-50 border-b border-yellow-600/20 px-4 py-2 text-center text-sm text-yellow-700">
        Payment failed.{" "}
        <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
          Update your payment method
        </Link>{" "}
        to avoid service interruption.
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Add banner to shell layout**

Read `apps/web/src/app/dashboard/(shell)/layout.tsx` and add the banner. Add import and insert before the TopBar or after it, inside the layout div:

Add import:

```ts
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner"
```

Insert `<SubscriptionBanner />` right before the `<TopBar>` component in the JSX.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/SubscriptionBanner.tsx apps/web/src/app/dashboard/\(shell\)/layout.tsx
git commit -m "feat: add subscription status banners to dashboard"
```

---

### Task 17: Billing section in Settings page

**Files:**
- Create: `apps/web/src/components/billing/BillingSection.tsx`
- Create: `apps/web/src/components/billing/UsageBar.tsx`
- Modify: `apps/web/src/app/dashboard/(shell)/settings/page.tsx`

- [ ] **Step 1: Create UsageBar component**

```tsx
"use client"

export function UsageBar({
  used,
  included,
  label,
}: {
  used: number
  included: number
  label?: string
}) {
  const percent = included > 0 ? Math.min((used / included) * 100, 100) : 0
  const isOver = used > included

  return (
    <div>
      {label && <p className="text-xs text-muted mb-1">{label}</p>}
      <div className="w-full h-2 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOver ? "bg-red-500" : percent > 80 ? "bg-yellow-500" : "bg-accent"
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted mt-1">
        {used.toLocaleString()} / {included.toLocaleString()} minutes used
        {isOver && (
          <span className="text-red-500 ml-1">
            ({(used - included).toLocaleString()} overage)
          </span>
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create BillingSection component**

```tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UsageBar } from "./UsageBar"
import { TRIAL_MINUTES } from "@/lib/billing-constants"

interface BillingData {
  plan: {
    tier: string
    name: string
    billingCycle: string
    status: string
    currentPeriodStart: string
    currentPeriodEnd: string
    trialEnd: string | null
    cancelAtPeriodEnd: boolean
  }
  usage: {
    minutesUsed: number
    minutesIncluded: number
    overagePerMinute: number
  }
}

export function BillingSection() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const router = useRouter()

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/usage")
      if (res.ok) {
        setData(await res.json() as BillingData)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBilling()
  }, [fetchBilling])

  async function openPortal() {
    setPortalLoading(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const result = await res.json() as { url?: string }
      if (result.url) {
        router.push(result.url)
      }
    } catch {
      toast.error("Could not open billing portal. Please try again.")
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-48 rounded bg-border animate-pulse" />
        <div className="h-3 w-64 rounded bg-border animate-pulse" />
        <div className="h-2 w-full rounded bg-border animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-muted">
        No billing information available.
      </p>
    )
  }

  const isTrial = data.plan.status === "TRIALING"
  const trialEnd = data.plan.trialEnd ? new Date(data.plan.trialEnd) : null
  const daysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  const periodStart = new Date(data.plan.currentPeriodStart)
  const periodEnd = new Date(data.plan.currentPeriodEnd)

  return (
    <div className="space-y-5">
      {/* Current plan */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{data.plan.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/8 text-accent border border-accent/20">
              {data.plan.billingCycle === "ANNUAL" ? "Annual" : "Monthly"}
            </span>
            {isTrial && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                Trial — {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
              </span>
            )}
          </div>
          {!isTrial && (
            <p className="text-xs text-muted mt-1">
              Next billing: {periodEnd.toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => void openPortal()}
          disabled={portalLoading}
          className="text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
        >
          {portalLoading ? "Loading…" : "Manage billing"}
        </button>
      </div>

      {/* Usage */}
      <UsageBar
        used={data.usage.minutesUsed}
        included={isTrial ? TRIAL_MINUTES : data.usage.minutesIncluded}
        label={`${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`}
      />

      {data.usage.minutesUsed > data.usage.minutesIncluded && !isTrial && (
        <p className="text-xs text-muted">
          Overage: {data.usage.minutesUsed - data.usage.minutesIncluded} min × ${(data.usage.overagePerMinute / 100).toFixed(2)}/min
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add BillingSection to Settings page**

In `apps/web/src/app/dashboard/(shell)/settings/page.tsx`, add import at top:

```ts
import { BillingSection } from '@/components/billing/BillingSection'
```

Insert after the Calendar section (after the closing `</div>` of the Calendar card, around line 271):

```tsx
        {/* Plan & Billing */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5">
            <h2 className="font-serif text-base text-ink">Plan & Billing</h2>
            <p className="text-sm text-muted mt-1">
              Manage your subscription and view usage.
            </p>
          </div>
          <BillingSection />
        </div>
```

- [ ] **Step 4: Type check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/ apps/web/src/app/dashboard/\(shell\)/settings/page.tsx
git commit -m "feat: add billing section to settings page with usage bar"
```

---

### Task 18: Update pricing page

**Files:**
- Modify: `apps/web/src/app/pricing/page.tsx`

- [ ] **Step 1: Update "Extra agents" row to "Contact us"**

In each plan's feature list, find `Extra agents {plan.extraAgents}` and replace with `Extra agents: contact us`.

Also add a note below the pricing hero about USD:

After the hero subtitle paragraph, add:

```tsx
        <p className="text-xs text-muted mt-2">
          Prices shown in USD. Local currency applied at checkout.
        </p>
```

- [ ] **Step 2: Remove the `extraAgents` field from the plans array**

Remove the `extraAgents` property from each plan object.

- [ ] **Step 3: Update the list item to use static text**

Replace the extra agents list item with:

```tsx
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-ink">Extra agents: contact us</span>
                </li>
```

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "fix: update pricing page — extra agents to 'contact us', add USD note"
```

---

### Task 19: Final verification

- [ ] **Step 1: Type check**

```bash
pnpm type-check
```

Expected: Pass

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: Build succeeds with all new routes listed.

- [ ] **Step 3: Verify new routes appear in build output**

Check that the build output includes:
- `/dashboard/choose-plan`
- `/api/webhooks/stripe`
- `/api/billing/checkout`
- `/api/billing/portal`
- `/api/billing/usage`

- [ ] **Step 4: Update README.md**

Add the new API routes to the API Routes table in README.md:

| `/api/billing/checkout` | POST | Create Stripe Checkout session |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session |
| `/api/billing/usage` | GET | Get current billing period usage |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |

Add to Environment Variables section:

| `STRIPE_SECRET_KEY` | Stripe server-side API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs: update README with billing routes and Stripe env vars"
```
