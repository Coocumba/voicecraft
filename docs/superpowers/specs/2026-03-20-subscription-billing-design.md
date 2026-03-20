# VoiceCraft Subscription & Billing System — Design Spec

**Date:** 2026-03-20
**Status:** Reviewed
**Author:** Sharan + Claude

---

## 1. Overview

VoiceCraft needs a subscription and billing system to enforce plan limits, track usage, handle payments, and manage the trial-to-paid lifecycle. Stripe is the payment provider and source of truth for subscription lifecycle. The local database caches subscription state (synced via webhooks) and owns plan definitions and enforcement logic.

### Pricing Model

Per-minute billing with tiered plans. Each agent requires a phone number + SIP trunk (~$5/mo per agent).

| | Starter | Growth | Professional |
|---|---|---|---|
| Monthly | $49/mo | $99/mo | $249/mo |
| Annual | $39/mo | $84/mo | $209/mo |
| Included minutes | 500 (~150 calls) | 1,500 (~450 calls) | 5,000 (~1,500 calls) |
| Overage | $0.05/min | $0.04/min | $0.03/min |
| Agents | 1 | 3 | 10 |
| Extra agents | Contact us | Contact us | Contact us |
| All features | Yes | Yes | Yes |
| 14-day free trial | Yes | Yes | Yes |

Plus **Enterprise** (custom pricing, handled manually outside this system).

---

## 2. Architecture Decision

**Approach: Stripe as Source of Truth**

Stripe owns the subscription lifecycle (creation, upgrades, downgrades, cancellations, retries, dunning). The local database caches subscription state via webhooks and owns plan definitions (limits, pricing, Stripe price ID mappings) for fast enforcement reads.

Key principle: local cache is always *derived from* Stripe. If there's a mismatch, Stripe wins.

### Why This Approach

- Single source of truth for subscription state — no drift
- Stripe handles subscription lifecycle edge cases (proration, dunning, retries, SCA)
- Less custom billing code = fewer bugs
- Battle-tested by thousands of SaaS companies

---

## 3. Data Model

### Extend Existing: User

```prisma
model User {
  // ... existing fields ...
  stripeCustomerId    String?   @unique
  subscription        Subscription?
}
```

### New: Plan

Stores plan definitions, limits, and Stripe price mappings. Seeded on deploy.

```prisma
model Plan {
  id                    String    @id @default(cuid())
  tier                  PlanTier  @unique
  name                  String                     // "Starter", "Growth", "Professional"
  monthlyPrice          Int                        // cents (4900, 9900, 24900)
  annualPricePerMonth   Int                        // cents per month for display (3900, 8400, 20900)
  annualPriceTotal      Int                        // cents charged annually (46800, 100800, 250800)
  minutesIncluded       Int                        // 500, 1500, 5000
  overagePerMinute      Int                        // cents (5, 4, 3)
  maxAgents             Int                        // 1, 3, 10
  stripePriceMonthly    String                     // Stripe price ID
  stripePriceAnnual     String                     // Stripe price ID
  stripeOveragePrice    String                     // Stripe metered price ID
  trialDays             Int       @default(14)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  subscriptions         Subscription[]
}
```

**Notes:**
- `annualPricePerMonth` is the display value ($39/mo); `annualPriceTotal` is what Stripe actually charges ($468/yr). Stripe Price IDs are the source of truth for billing amounts.
- `trialMinutes` removed — trial minute limit (60) is a global constant in `src/lib/plans.ts`, not per-plan.
- `extraAgentPrice` removed — extra agent add-ons are out of scope for v1 (see Section 16). The pricing page row will say "Contact us" for extra agents until add-on purchasing is implemented.

### New: Subscription

One active subscription per user. Links to Stripe subscription and local Plan via foreign key.

```prisma
model Subscription {
  id                    String              @id @default(cuid())
  userId                String              @unique
  user                  User                @relation(fields: [userId], references: [id])
  planId                String
  plan                  Plan                @relation(fields: [planId], references: [id])
  stripeSubscriptionId  String              @unique
  stripePriceId         String
  status                SubscriptionStatus  // TRIALING, ACTIVE, PAST_DUE, CANCELED, PAUSED
  planTier              PlanTier            // STARTER, GROWTH, PROFESSIONAL
  billingCycle          BillingCycle        // MONTHLY, ANNUAL
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  trialStart            DateTime?
  trialEnd              DateTime?
  cancelAtPeriodEnd     Boolean             @default(false)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
  usageRecords          UsageRecord[]
}
```

**Note:** `planId` foreign key makes the Plan join explicit and typed. `planTier` is kept as a denormalized field for quick enforcement reads without joining.

### New: UsageRecord

Tracks minutes used per billing period. One record per subscription per period.

```prisma
model UsageRecord {
  id               String       @id @default(cuid())
  userId           String
  subscriptionId   String
  subscription     Subscription @relation(fields: [subscriptionId], references: [id])
  periodStart      DateTime
  periodEnd        DateTime
  minutesUsed      Int          @default(0)
  minutesIncluded  Int                        // snapshot from Plan at period start
  maxAgents        Int                        // snapshot from Plan at period start
  overagePerMinute Int                        // snapshot from Plan at period start (cents)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@unique([subscriptionId, periodStart])
  @@index([userId])
}
```

**Notes:**
- `maxAgents` and `overagePerMinute` are snapshotted at period start alongside `minutesIncluded`. If plan limits change, existing subscribers keep their current-period limits until the next billing cycle.
- `@@index([userId])` added for enforcement queries that look up usage by user.
- `minutesUsed` MUST be incremented using Prisma's atomic `{ increment: X }` operation (maps to `UPDATE SET minutes_used = minutes_used + X`), never a read-then-write, to avoid race conditions under concurrent call endings.

### New: StripeEvent

Idempotency table to prevent duplicate webhook processing.

```prisma
model StripeEvent {
  id          String   @id                  // Stripe event ID (evt_xxx)
  type        String                        // event type
  processedAt DateTime @default(now())

  @@index([processedAt])
}
```

**Note:** Index on `processedAt` supports cleanup. A scheduled job (or the daily reconciliation cron) purges events older than 30 days — Stripe only retries webhooks for up to 3 days, so older events cannot be duplicated.

### Enums

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

### Extend Existing: AgentStatus Enum

Add `PAUSED` to the existing `AgentStatus` enum:

```prisma
enum AgentStatus {
  DRAFT
  ACTIVE
  INACTIVE
  PAUSED     // NEW — set by billing system when subscription lapses
}
```

**Behavior of PAUSED agents:**
- LiveKit dispatch rules are **torn down** (stops calls from routing to the agent). SIP trunks are **kept in place** (preserves phone number association, cheaper to rebuild dispatch rules than trunks).
- PAUSED agents cannot be re-deployed without an active subscription.
- On subscription resume (payment recovered), dispatch rules are re-created for all previously-PAUSED agents as a background task. If LiveKit re-provisioning fails, log the error and surface it on the dashboard — don't silently leave agents broken.
- All existing code that checks for `ACTIVE`/`INACTIVE` must also handle `PAUSED` (e.g., LiveKit dispatch logic, agent list UI).

---

## 4. Stripe Product & Price Structure

One **Product** ("VoiceCraft") with 6 flat **Prices** (3 tiers x 2 billing cycles) plus 3 **metered Prices** for overages:

| Stripe Price | Tier | Cycle | Amount |
|---|---|---|---|
| `price_starter_monthly` | Starter | Monthly | $49/mo |
| `price_starter_annual` | Starter | Annual | $468/yr ($39/mo) |
| `price_growth_monthly` | Growth | Monthly | $99/mo |
| `price_growth_annual` | Growth | Annual | $1,008/yr ($84/mo) |
| `price_pro_monthly` | Professional | Monthly | $249/mo |
| `price_pro_annual` | Professional | Annual | $2,508/yr ($209/mo) |
| `price_starter_overage` | Starter | Metered | $0.05/min |
| `price_growth_overage` | Growth | Metered | $0.04/min |
| `price_pro_overage` | Professional | Metered | $0.03/min |

Each Stripe subscription has **two line items**: the flat recurring price + the metered overage price.

Stripe Price IDs are stored in the Plan table in the database, not hardcoded.

---

## 5. Signup & Trial Flow

### Sequence

1. **User registers** (existing flow — email/password or Google OAuth)
2. **After first login**, middleware detects no Subscription for user
3. **Redirect to `/dashboard/choose-plan`** — shows 3 tiers with "Start free trial" buttons
4. **User picks a tier:**
   - Backend creates a Stripe Customer (stores `stripeCustomerId` on User)
   - Backend creates a Stripe Subscription with `trial_period_days: 14`, no payment method required
   - Backend creates local Subscription (status: `TRIALING`) and UsageRecord using the `stripeSubscriptionId` from the API response — this is the canonical write path
   - The `customer.subscription.created` webhook handler does an **upsert** keyed on `stripeSubscriptionId` (idempotent — if the local record already exists, it's a no-op)
5. **User lands on dashboard** — can create agents, make calls within trial limits

### Trial Limits

- 60 minutes (regardless of chosen tier)
- 1 agent (regardless of chosen tier)
- Full tier limits unlock only after trial converts to paid

### Trial UX

- Dashboard shows banner: "X days left in your trial. Add a payment method to continue."
- Usage bar shows minutes used out of 60
- Day 7: email nudge to add payment method
- 3 days before expiry: `customer.subscription.trial_will_end` webhook triggers "trial ending soon" email

### Trial Expiration (No Card Added)

**Important:** The exact Stripe event depends on your Stripe subscription settings. Configure Stripe to: "When a trial ends without a payment method, mark the subscription as `paused`." This must be tested in Stripe's test environment before going live.

The webhook handler for `customer.subscription.updated` must handle ALL of these status transitions as "subscription lapsed":
- `past_due` — payment attempted and failed (card on file but declined)
- `canceled` — Stripe canceled the subscription (no card, configured to cancel)
- `unpaid` — invoice generated but no payment method to charge
- `paused` — Stripe paused the subscription (configured behavior)

On any of these transitions:
- Webhook updates local Subscription to `PAUSED`
- All active agents set to `PAUSED` — LiveKit dispatch rules torn down, calls go unanswered
- User sees "Your trial has ended" banner with CTA to add payment method
- Dashboard read-only (can view calls/history, cannot create/deploy agents)

### Trial Conversion (Card Added)

- User adds card via Stripe Checkout
- Stripe auto-charges at trial end, fires `invoice.paid` webhook
- Webhook updates Subscription to `ACTIVE`
- Full plan limits unlock

---

## 6. Enforcement Layer

### Agent Creation (`POST /api/agents`)

- Count user's existing agents (non-deleted)
- If `subscription.status === TRIALING` → max 1 agent
- If `ACTIVE` → check `Plan.maxAgents` for their tier (or `UsageRecord.maxAgents` for current-period snapshot)
- Over limit → 403: "Upgrade your plan to add more agents"

**Concurrency safety:** The count check and agent insert must be wrapped in a `prisma.$transaction` with a `SELECT COUNT(*) ... FOR UPDATE` raw query on the user's agents. This prevents two concurrent requests from both reading below the limit and both inserting. This is critical for the trial (1 agent limit) and lower tiers.

### Agent Deployment (`POST /api/agents/[id]/deploy`)

- Same agent count check as creation
- Block if subscription status is `PAUSED` or `CANCELED`

### Phone Number Provisioning (`POST /api/agents/[id]/provision-number`)

- Tied to agent limits (1 number per agent)
- No separate number limit

### Call Handling (agent worker → `POST /api/calls`)

- **Calls are never blocked** (soft limit)
- After call ends: increment `UsageRecord.minutesUsed` using Prisma's atomic `{ increment: X }` (round up to nearest minute). Read the returned `minutesUsed` value from the update response.
- Check alert thresholds against the returned (post-increment) value — not a separate read
- Periodic job (every 5 min) batches and reports usage to Stripe Billing Meters
- If `minutesUsed` crosses threshold → queue alert email via Resend (non-blocking, don't delay the API response)

### Dashboard Middleware (all `/dashboard/*` routes)

**Important:** The existing middleware runs on the Next.js Edge Runtime. Prisma (`@voicecraft/db`) is NOT edge-compatible. Subscription status must be read from the JWT session token, not from a direct DB query.

**Approach: Store subscription status in the JWT.**
- In NextAuth `jwt` callback: when the token is created or refreshed, fetch subscription status from DB and embed `subscriptionStatus` and `planTier` in the JWT payload.
- When a webhook updates subscription status, trigger a session refresh using Auth.js v5's `unstable_update` mechanism (or set a flag that forces re-fetch on next request).
- Middleware reads `subscriptionStatus` from the JWT — no DB call needed.
- Tradeoff: status can be stale between session refreshes. Acceptable because enforcement also happens at the API route level (belt and suspenders).

**Middleware behavior:**
- No subscription in JWT → redirect to `/dashboard/choose-plan`
- `PAUSED` or `CANCELED` → allow access but dashboard layout renders warning banner
- `PAST_DUE` → allow access, dashboard layout renders payment warning banner
- Banners and action blocking (agent creation/deployment) are enforced in the dashboard layout and API routes, not in middleware

### Usage Alert Thresholds

| Threshold | Action |
|---|---|
| 80% of included minutes | Email + dashboard warning |
| 100% | Email: overage charges now active |
| 150% | Email: strong nudge to upgrade plan |

---

## 7. Webhook Handling

### Route: `POST /api/webhooks/stripe`

Authenticated via Stripe webhook signature verification. Exempt from session auth.

### Events Handled

| Event | Action |
|---|---|
| `customer.subscription.created` | Upsert local Subscription record + UsageRecord (idempotent — record may already exist from the checkout API response) |
| `customer.subscription.updated` | Sync status, plan tier, period dates. If status → `past_due`/`canceled`/`unpaid`/`paused`, set local status to PAUSED and pause agents (tear down dispatch rules). |
| `customer.subscription.deleted` | Set Subscription to `CANCELED`, pause all agents |
| `invoice.paid` | If was `PAST_DUE`/`PAUSED` → restore to `ACTIVE`, re-create LiveKit dispatch rules for previously-active agents (background task). Create new UsageRecord for new billing period. |
| `invoice.payment_failed` | Update Subscription to `PAST_DUE`, trigger dunning email |
| `customer.subscription.trial_will_end` | Send "trial ending in 3 days" email |

### Idempotency

- Each webhook includes a Stripe event ID
- Check StripeEvent table before processing — skip if already processed
- Record event ID after processing
- Always return 200 (even on handler errors — log and alert, don't cause Stripe retries on bad logic)

---

## 8. Failed Payment Recovery (Dunning)

1. **Stripe Smart Retries** enabled — ML-optimized retry timing over ~21 days
2. **Dunning email flow** triggered by `invoice.payment_failed`:
   - Day 1: "Payment failed — update your method" (link to Stripe Customer Portal)
   - Day 3: "Still having issues — service may be interrupted"
   - Day 7: "Last chance — update payment to avoid service pause"
3. **After all retries fail** → subscription `CANCELED`, all agents paused

---

## 9. International Billing

### Stripe Adaptive Pricing

- Prices defined in USD as base currency in Plan table
- Stripe Checkout detects customer location and presents local currency (150+ countries)
- Stability buffer keeps renewal amounts consistent despite exchange rate fluctuations
- Region-appropriate payment methods shown automatically (SEPA, iDEAL, etc.)
- Settlement in USD regardless of customer currency
- 1% additional fee on converted transactions (merchant-side, not customer-facing)

### Implementation

- Enable Adaptive Pricing in Stripe Dashboard (toggle)
- Use Stripe Checkout for all payment flows (not custom forms)
- Use Stripe Customer Portal for self-service (payment updates, invoices)
- Pricing page shows USD with note: "Prices shown in USD. Local currency applied at checkout."

---

## 10. Scalability — Usage Metering

Following the pattern used by Edgee (billions of events) and Stripe's recommendations:

1. **Buffered reporting** — After each call ends, increment `UsageRecord.minutesUsed` in DB (fast local write). A periodic job (every 5 min) batches and reports to Stripe Billing Meters.
2. **Stripe Billing Meters** — Send events with timestamps and quantities. **Every meter event must include a stable `identifier`** for deduplication — use `usageRecord.id + "-" + batchTimestamp`. Without this, job retries or crashes will cause double-billing.
3. **Alert thresholds checked on write** — When incrementing `minutesUsed`, check the returned value against thresholds. Queue alert emails via Resend (non-blocking).
4. **Daily reconciliation cron** — Compares local UsageRecord totals against Stripe meter readings. Logs discrepancies. Also purges StripeEvent records older than 30 days.

---

## 11. Security

1. **Webhook signature verification** — `stripe.webhooks.constructEvent()` with endpoint secret. Reject unsigned requests.
2. **Idempotent processing** — StripeEvent table prevents double-processing.
3. **No card data stored locally** — Only `stripeCustomerId` and `stripeSubscriptionId`. Stripe handles PCI compliance.
4. **Stripe Checkout for all payment flows** — PCI DSS Level 1 certified, automatic 3D Secure/SCA for EU.
5. **Stripe Customer Portal for self-service** — Payment method updates, invoices, cancellations. Less attack surface.
6. **API key separation** — Restricted keys with minimal permissions. Webhook secret separate from API secret.
7. **Webhook route protection** — `/api/webhooks/stripe` exempt from session auth, protected by signature verification.

---

## 12. UI — Plan & Billing

### Location

Settings page (`/dashboard/settings`) — new "Plan & Billing" tab. Standard SaaS pattern familiar to non-technical users.

### Plan & Billing Page Sections

**1. Current Plan**
- Plan name, tier badge, billing cycle
- Trial: "Trial — X days remaining" with progress bar
- Active: next billing date and amount
- Past due: red warning with "Update payment method" CTA
- "Change plan" button → plan change modal

**2. Usage This Period**
- Progress bar: "342 / 1,500 minutes used"
- Period dates: "Mar 1 – Mar 31, 2026"
- Over included minutes: shows overage count and estimated charge
- Per-agent breakdown (collapsible)

**3. Payment Method**
- Card on file (brand + last 4): "Visa ending in 4242"
- "Update" button → Stripe Customer Portal
- No card (trial): "Add payment method" CTA → Stripe Checkout

**4. Billing History**
- Table of past invoices: date, amount, status, PDF download
- Fetched from Stripe (`stripe.invoices.list` with `limit: 10` and cursor pagination) — not stored locally
- Rendered as a **client component with its own loading state** so it doesn't block the rest of the settings page if Stripe has latency

### Plan Change Modal

- 3 tiers side by side (same layout as public pricing page)
- Current plan highlighted with "Current" badge
- Monthly/annual toggle
- Upgrade → Stripe prorated subscription update, immediate effect
- Downgrade → **blocked if current agent count exceeds new plan's `maxAgents`**. Show message: "You currently have X active agents. Please reduce to Y or fewer before downgrading." If agent count is within limit, downgrade takes effect at end of current period (`cancel_at_period_end` + schedule new subscription).

### Choose Plan Page (`/dashboard/choose-plan`)

- Shown to new users with no subscription (middleware redirect)
- Lives in the `(focused)` layout group (not `(shell)`) — distraction-free onboarding flow, no full nav shown to a user who doesn't have a working dashboard yet
- 3-tier layout with "Start free trial" buttons
- After selection → creates Stripe customer + subscription → redirects to dashboard

---

## 13. Environment Variables

**New vars in `apps/web/.env.local`:**

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |

**Note:** `STRIPE_PUBLISHABLE_KEY` is not needed. We use redirect-based Stripe Checkout (server creates session via `STRIPE_SECRET_KEY`, redirects to `session.url`). No client-side Stripe.js initialization required.

### Stripe Dashboard Configuration (One-Time Setup)

- Create Product + 9 Prices (6 flat + 3 metered)
- Enable Adaptive Pricing
- Enable Smart Retries
- Configure Customer Portal (plan changes, cancellation, payment method updates)
- Set up webhook endpoint → `https://yourdomain.com/api/webhooks/stripe`
- Configure dunning email settings

### Seed Script Update

Plan table seeded with 3 tiers, their limits, and Stripe Price IDs (from Stripe Dashboard).

---

## 14. Files to Create/Modify

### New Files

| File | Purpose |
|---|---|
| `packages/db/prisma/schema.prisma` | Add Plan, Subscription, UsageRecord, StripeEvent models + enums |
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler |
| `apps/web/src/app/api/billing/checkout/route.ts` | Create Stripe Checkout session |
| `apps/web/src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal session |
| `apps/web/src/app/api/billing/usage/route.ts` | Get current usage for dashboard |
| `apps/web/src/app/dashboard/(focused)/choose-plan/page.tsx` | Plan selection for new users (focused layout, no nav) |
| `apps/web/src/app/dashboard/(shell)/settings/billing/` | Plan & Billing tab components |
| `apps/web/src/lib/stripe.ts` | Stripe client singleton |
| `apps/web/src/lib/plans.ts` | Helper to fetch plan limits, check enforcement |
| `apps/web/src/lib/usage.ts` | Usage tracking helpers (increment, check thresholds) |
| `packages/db/prisma/seed-plans.ts` | Seed Plan table with tier data |

### Modified Files

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add new models and enums |
| `apps/web/src/middleware.ts` | Add subscription check, redirect to choose-plan if none |
| `apps/web/src/app/api/agents/route.ts` | Enforce agent count limit on POST |
| `apps/web/src/app/api/agents/[id]/deploy/route.ts` | Check subscription status before deploy |
| `apps/web/src/app/api/agents/[id]/provision-number/route.ts` | Check agent limits before provisioning |
| `apps/web/src/app/api/calls/route.ts` | Increment UsageRecord after call logged |
| `apps/web/src/app/dashboard/(shell)/settings/page.tsx` | Add Plan & Billing tab |
| `apps/web/.env.example` | Add STRIPE_* vars |

---

## 15. Profit Margins

All tiers profitable even worst-case (100% minutes used + international customer):

| Plan | Revenue | Costs (Stripe + infra) | Profit | Margin |
|---|---|---|---|---|
| Starter $49/mo | $49 | ~$19 | ~$30 | ~61% |
| Growth $99/mo | $99 | ~$55 | ~$44 | ~44% |
| Professional $249/mo | $249 | ~$180 | ~$69 | ~28% |

- Domestic customers skip 1% Adaptive Pricing fee → higher margins
- Most users won't exhaust included minutes → real margins better
- Overage minutes are high-margin (~$0.024 cost vs $0.03–$0.05 charge)
- Annual plans have ~20% lower revenue but lower churn → better LTV

---

## 16. Out of Scope (v1)

The following are explicitly deferred to future iterations:

1. **Extra agent add-ons** — Self-service purchasing of additional agent slots (+$10/mo each). Requires a Stripe add-on product, quantity management UI, and dynamic limit updates. For v1, users who need more agents than their plan allows should contact us or upgrade their tier. The pricing page will say "Contact us" for extra agents.

2. **Enterprise plan** — Custom pricing, unlimited agents, dedicated support. Handled manually (sales-led) outside this system.

3. **Usage analytics dashboard** — Detailed charts of call volume trends, peak hours, per-agent breakdown over time. v1 shows only current-period usage bar.

4. **Coupon/promo codes** — Stripe supports these natively but the UI flow and validation logic are deferred.

5. **Multi-currency display on pricing page** — v1 shows USD only with a note. Stripe Checkout handles actual localization.
