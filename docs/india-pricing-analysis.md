# VoiceCraft — India Market: ₹999/month Pricing Analysis

## Context

India represents a large addressable market — approximately 200,000 dental clinics, 1 million doctor offices, and 500,000 salons — with SMBs that match the VoiceCraft profile exactly. The self-serve builder requires no sales effort. However, the current global pricing structure (Starter at $49/month) is out of reach for most Indian SMBs. A ₹999/month (~$12) tier would be competitive locally, but the cost structure requires careful optimization to make it profitable.

This document models the current cost per user at Indian usage patterns, identifies where money is being spent, and shows a path to 74% margin at ₹999.

---

## Current Cost Structure Per User (India)

**Assumptions:**
- 100 voice minutes per month (typical for a solo dental clinic or salon)
- 200 WhatsApp messages per month (inbound + outbound combined)
- Default TTS provider: OpenAI `gpt-4o-mini-tts`
- WhatsApp bot LLM: Claude Sonnet (current default in `llm.ts`)
- LiveKit Cloud pricing at $0.036/min

| Service | What | Unit Cost | Monthly Cost |
|---|---|---|---|
| Twilio IN number | Phone number rental | $1.50/number | $1.50 |
| Twilio PSTN inbound | 100 min × $0.015/min | $0.015/min | $1.50 |
| LiveKit Cloud | 100 min × $0.036/min | $0.036/min | $3.60 |
| Deepgram Nova-3 | STT, ~50 active speech minutes | $0.006/min | $0.30 |
| Gemini 2.5 Flash | Voice agent LLM | ~negligible | $0.01 |
| OpenAI gpt-4o-mini-tts | TTS audio generation | ~$0.0003/min | $0.03 |
| Claude Sonnet | WhatsApp bot, 200 msgs × $0.0075 | $0.0075/msg | $1.50 |
| Twilio + Meta | WhatsApp messaging fees | ~$0.006/msg | $1.17 |
| Infrastructure | DB + hosting allocated share | flat | $0.25 |
| **Total** | | | **~$9.86** |

**Revenue at ₹999:** ~$12.00 (at ₹83/$1)

**Gross margin: $2.14 per user per month — approximately 18%**

At this margin there is no room for customer support costs, payment processing fees (Stripe: ~2.9% + $0.30 = ~$0.65), churn, or any sales and marketing spend. The plan is operationally viable but not commercially sustainable.

---

## Key Cost Drivers

Ranked by contribution to the $9.86 total:

| Rank | Line Item | Monthly Cost | % of Total | Controllable? |
|---|---|---|---|---|
| 1 | LiveKit Cloud | $3.60 | 36% | Yes — self-hosting eliminates most of this |
| 2 | Claude Sonnet (WhatsApp bot) | $1.50 | 15% | Yes — Gemini Flash is a direct drop-in |
| 3 | Twilio PSTN inbound | $1.50 | 15% | No — carrier cost, unavoidable |
| 4 | Twilio IN number | $1.50 | 15% | No — fixed per number |
| 5 | Twilio + Meta WhatsApp | $1.17 | 12% | Partially — can be made optional |
| 6 | Deepgram STT | $0.30 | 3% | Limited — competitive pricing already |
| 7 | Infrastructure | $0.25 | 3% | Marginal improvement only |
| 8 | OpenAI TTS | $0.03 | <1% | Yes — Google TTS is cheaper but lower quality |
| 9 | Gemini (voice LLM) | $0.01 | <1% | Already optimal |

**ElevenLabs TTS is not in the default stack for good reason.** At ~$0.18–0.30 per 1,000 characters and typical call verbosity, ElevenLabs would add $4–8/month per user at Indian call volumes. If India-tier plans are created, ElevenLabs TTS must be explicitly disabled or blocked for that plan tier.

---

## Cost Per Minute Breakdown

Understanding per-minute variable cost is important for setting accurate overage rates.

| Component | US per minute | India per minute |
|---|---|---|
| LiveKit Cloud | $0.036 | $0.036 |
| Twilio PSTN inbound | $0.0085 | $0.015 |
| Deepgram STT (50% speech ratio) | $0.003 | $0.003 |
| OpenAI TTS | $0.0003 | $0.0003 |
| Gemini Flash LLM | ~$0.00005 | ~$0.00005 |
| **Total variable per minute** | **~$0.048** | **~$0.055** |

India's PSTN rate is nearly double the US rate ($0.015 vs $0.0085), which is meaningful when LiveKit Cloud is also in the stack. Self-hosting LiveKit changes the dominant cost from the $0.036 LiveKit line to the $0.015 Twilio PSTN line.

---

## Four Optimizations to Make ₹999 Profitable

### 1. Switch WhatsApp Bot from Claude Sonnet to Gemini 2.5 Flash

**Current state:** The WhatsApp webhook (`/api/webhooks/twilio-whatsapp/route.ts`) calls `chatCompletion()` from `lib/llm.ts`, which defaults to `claude-sonnet-4-20250514` at approximately $0.0075 per message.

**Proposed change:** Switch the WhatsApp messaging LLM to Gemini 2.5 Flash. The voice agent already uses Gemini Flash for all real-time conversation handling. The WhatsApp bot task (read conversation history, generate a reply, parse an action) is well within Gemini Flash's capability.

**Cost:** Gemini 2.5 Flash input/output at 200 messages is approximately $0.09/month, versus $1.50/month for Claude Sonnet.

**Saving: $1.41/month per user**

**Implementation:** Add a `WHATSAPP_LLM_PROVIDER` environment variable that routes to Gemini for WhatsApp completions, or configure the India plan to use a different LLM in `chatCompletion()`. The interface in `llm.ts` already abstracts the provider — adding a Gemini path requires adding the `@google/generative-ai` SDK and a branch in `chatCompletion()`.

---

### 2. Self-Host LiveKit Instead of LiveKit Cloud

**Current state:** The voice agent connects to LiveKit Cloud at $0.036/minute. At 100 minutes/month per user, this is $3.60 — the single largest variable cost.

**Proposed change:** Run a self-hosted LiveKit server on a dedicated VPS. A $20/month VPS (4 vCPU, 8 GB RAM) can handle 30–50 concurrent calls. At 100 users each making 100 minutes of calls spread across the month, peak concurrency is approximately 5–10 simultaneous calls — well within that capacity.

**Cost allocation per user:** $20/month ÷ 100 users = $0.20/month

**Saving: $3.40/month per user**

**Requirements:** The `LIVEKIT_*` environment variables in both `apps/web` and `apps/agent` would point to the self-hosted instance instead of LiveKit Cloud. No application code changes are needed. The self-hosted instance requires a public IP, TLS termination, and monitoring.

**Risk:** LiveKit Cloud provides SLA-backed uptime. Self-hosted requires operational responsibility. A single VPS introduces a single point of failure — consider a two-node setup with DNS failover for production.

---

### 3. Cap India Plan at 60 Minutes Per Month

**Current state:** The Starter plan includes 500 minutes/month. For an Indian solo practitioner, this is far more than needed.

**Usage reality:** A solo dentist seeing 20 patients per day, five days per week, will typically field 10–25 new booking calls per month. Average call duration for a straightforward booking is 2–3 minutes. Realistic monthly usage: 20–50 minutes. A 60-minute cap covers the median user comfortably.

**Proposed cap:** 60 minutes included, with ₹5/minute overage (approximately $0.06/minute — above the $0.055 variable cost, so overage is profitable).

This does two things:
1. Reduces the expected LiveKit and PSTN cost to 60 minutes × $0.055 = $3.30 (or $1.20 on self-hosted LiveKit).
2. Creates a natural upgrade trigger for businesses that grow beyond the cap.

---

### 4. Make WhatsApp a ₹299/month Add-On

**Current state:** WhatsApp is bundled with all agents on the Growth and Professional plans. For India, the Twilio + Meta messaging fees ($1.17/month at 200 messages) are unavoidable once WhatsApp is enabled.

**Proposed change:** Offer the India Basic tier without WhatsApp included. SMS confirmations remain available (no Meta approval required, lower per-message cost). Businesses that want WhatsApp add it as a ₹299/month (~$3.60) add-on.

**Economics of the add-on:**
- WhatsApp add-on revenue: $3.60
- Twilio + Meta messaging cost: $1.17
- WhatsApp bot LLM (Gemini Flash): $0.09
- Net from add-on: $2.34 margin per user

This also removes the WhatsApp approval dependency from the base product — new India users can be onboarded and operational immediately without waiting for Meta's approval process.

---

## Revised India Tier Cost Structure

Applying all four optimizations (self-hosted LiveKit, Gemini Flash for WhatsApp, 60-minute cap, WhatsApp excluded from base):

| Service | Monthly Cost |
|---|---|
| Twilio IN number | $1.50 |
| Twilio PSTN inbound (60 min × $0.015) | $0.90 |
| LiveKit self-hosted (allocated share) | $0.20 |
| Deepgram STT (30 active speech minutes) | $0.18 |
| Gemini Flash — voice LLM | $0.01 |
| Gemini Flash — WhatsApp bot (if enabled) | $0.08 |
| OpenAI TTS | $0.02 |
| Infrastructure (DB + hosting share) | $0.25 |
| **Total (base, no WhatsApp)** | **$3.14** |

**Revenue at ₹999:** ~$12.00

**Gross margin: $8.86 per user per month — approximately 74%**

After Stripe fees (~$0.65) and infrastructure amortization, net margin is approximately 65–68%. This is a commercially viable plan.

---

## Market Opportunity

| Segment | Estimated Count | Target |
|---|---|---|
| Dental clinics in India | ~200,000 | Primary |
| Doctor offices / clinics | ~1,000,000 | Secondary |
| Salons and spas | ~500,000 | Secondary |
| Home service businesses | ~2,000,000 | Tertiary |

**Conservative scenario:** 0.1% penetration of dental + salon market alone = approximately 700 users.

- Monthly recurring revenue: 700 × $12 = $8,400/month
- Monthly cost: 700 × $3.14 = $2,198/month
- Monthly gross profit: ~$6,200

**Moderate scenario:** 0.5% penetration = 3,500 users.

- Monthly recurring revenue: $42,000
- Monthly cost: $10,990
- Monthly gross profit: ~$31,000

The self-serve builder means no sales team is required to acquire these users. The builder conversation, agent configuration, number provisioning, and deployment are all fully automated. Customer acquisition cost is driven by marketing spend only.

---

## Suggested India Plan Structure

| Feature | India Basic (₹999/month) | India + WhatsApp (₹1,499/month) |
|---|---|---|
| Voice minutes included | 60 | 60 |
| Overage rate | ₹5/min | ₹5/min |
| Voice agents | 1 | 1 |
| SMS confirmations | Yes | Yes |
| WhatsApp confirmations | No | Yes (200 msgs included) |
| Calendar integration | Yes | Yes |
| Multi-language support | Yes | Yes |
| Call transcripts | Yes | Yes |
| Free trial | 14 days / 30 minutes | 14 days / 30 minutes |

**WhatsApp add-on note:** The ₹1,499 tier includes the Meta approval dependency. Users should be informed during signup that WhatsApp activation takes 1–2 weeks after account approval. SMS is active immediately.

---

## Implementation Checklist

The following changes are needed to launch an India tier:

1. **Add Gemini Flash to `lib/llm.ts`** — implement a `gemini` provider branch using `@google/generative-ai`. Gate it via an environment variable or plan configuration flag.

2. **Self-host LiveKit** — provision a VPS in an Indian or Singapore datacenter, deploy LiveKit server, update `LIVEKIT_*` environment variables for the India deployment.

3. **Create India plan in Stripe** — add a `INDIA_BASIC` and `INDIA_WHATSAPP` plan tier in the `Plan` table with INR pricing via Stripe's multi-currency support.

4. **Add plan-level minute cap enforcement** — the usage tracking already uses `UsageRecord` and `minutesIncluded`. A 60-minute cap works within the existing schema; only the plan seed data changes.

5. **Disable ElevenLabs TTS for India plans** — add a guard in `create_tts()` in `apps/agent/src/agent/plugins.py` that falls back to OpenAI TTS when the plan tier is India Basic/WhatsApp, regardless of any `voiceSettings` configuration on the agent.

6. **Make WhatsApp opt-in at plan level** — the `whatsappEnabled` flag on the `Agent` model already exists. Enforce that it can only be set to `true` on plans that include WhatsApp.
