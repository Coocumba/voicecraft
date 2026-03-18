# WhatsApp Messaging — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Problem

VoiceCraft is a globally-focused platform. SMS (the current messaging channel) has two blocking problems:

1. **US A2P 10DLC** — carriers reject messages from unregistered local numbers (error 30034)
2. **No global solution** — every country has different SMS registration requirements; maintaining per-country SMS compliance does not scale

WhatsApp operates in 180+ countries under a single registration model, making it the right global messaging channel for VoiceCraft.

---

## Decision

Replace SMS with WhatsApp as VoiceCraft's messaging channel. Drop per-country SMS compliance entirely.

- Each business gets **one phone number** that handles both voice calls and WhatsApp messages
- VoiceCraft operates as a **WhatsApp Tech Provider (ISV)** under Twilio's WAISV program — one Meta Business Account for the platform, provisioning numbers for all customers
- Customers see the **business's name** in WhatsApp (not "VoiceCraft")
- No action required from business owners to handle Meta compliance — VoiceCraft manages it

---

## Architecture

### Channel

```
Customer calls  {business number}  →  Twilio voice webhook  →  LiveKit voice agent
Customer texts  {business number} on WhatsApp  →  Twilio WhatsApp webhook  →  AI text reply
```

Same number. Two capabilities. No second number needed.

### Platform Templates

VoiceCraft maintains two Meta-approved WhatsApp message templates, stored as env vars. Used for all customers — variables fill in business-specific details at send time.

**Confirmation template** (`TWILIO_WA_CONFIRMATION_SID`):
> "Hi {{1}}, your {{2}} appointment with {{3}} is confirmed for {{4}} at {{5}}. We look forward to seeing you."

Variables: customer name, service, business name, date, time

**Reminder template** (`TWILIO_WA_REMINDER_SID`):
> "Hi {{1}}, reminder: your {{2}} appointment with {{3}} is on {{4}} at {{5}}. Let us know if you need to reschedule."

Variables: customer name, service, business name, date, time

Note: The reminder template deliberately avoids instructing customers to "Reply CANCEL" to prevent implying instant keyword processing that isn't implemented. Cancellations flow through the normal AI conversation handler when the customer messages back.

---

## Data Model Changes

### Rename SMS models to channel-agnostic names

| Old name | New name |
|---|---|
| `SmsConversation` | `Conversation` |
| `SmsMessage` | `Message` |
| `SmsDirection` | `MessageDirection` |
| `SmsSender` | `MessageSender` |
| `SmsConversationStatus` | `MessagingStatus` |

### New enum and field on `Conversation`

```prisma
enum MessageChannel {
  WHATSAPP
  SMS        // retained so existing data is not orphaned
}

model Conversation {
  // ...existing fields...
  channel       MessageChannel  @default(WHATSAPP)
  optedOut      Boolean         @default(false)  // per-customer opt-out flag

  @@unique([agentId, customerPhone, channel])  // updated from [agentId, customerPhone]
}
```

The unique constraint is updated to include `channel` — one conversation per customer per channel per agent. This allows existing SMS conversations and new WhatsApp conversations to coexist without conflict.

### Agent model changes

Remove `smsEnabled`. Add WhatsApp fields:

```prisma
enum WhatsAppStatus {
  NONE       // not set up
  PENDING    // submitted to Meta, awaiting approval
  APPROVED   // live
  FAILED     // Meta rejected
}

model Agent {
  // ...existing fields...
  whatsappEnabled        Boolean        @default(false)
  whatsappStatus         WhatsAppStatus @default(NONE)
  whatsappRegisteredNumber String?      // the number WhatsApp was approved on
  // smsEnabled removed
}
```

`whatsappRegisteredNumber` stores which number WhatsApp was approved on. If the agent releases and re-provisions a number, the app detects the mismatch and resets `whatsappStatus` to `NONE`, requiring re-registration. This prevents a stale approval from being used with a different number.

### Appointment model change

```prisma
model Appointment {
  // ...existing fields...
  reminderSent  Boolean  @default(false)

  @@index([scheduledAt, status, reminderSent])  // new — required for cron query performance
}
```

### Migration backfill

The Prisma migration must include an explicit SQL backfill to set existing `SmsConversation` rows to `channel = SMS` so they are not incorrectly treated as WhatsApp conversations:

```sql
UPDATE "Conversation" SET channel = 'SMS';
-- Then new rows default to WHATSAPP via the DEFAULT constraint
```

---

## API Routes

### New routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/agents/[id]/whatsapp` | Enable WhatsApp on agent's number |
| DELETE | `/api/agents/[id]/whatsapp` | Disable WhatsApp |
| POST | `/api/webhooks/twilio-whatsapp` | Inbound WhatsApp message handler |
| POST | `/api/webhooks/twilio-whatsapp-status` | Twilio/Meta approval + opt-out events |
| POST | `/api/cron/appointment-reminders` | Hourly reminder job (cron-protected) |

### Updated routes

| Route | Change |
|---|---|
| `GET /api/messages` | Filter by `agent.whatsappEnabled` (replaces `smsEnabled`); return `channel` field |
| `POST /api/messages` | Owner reply uses `sendWhatsApp()` for `channel = WHATSAPP` conversations (conversationId passed in body, not URL segment) |

### Removed routes

| Route | Reason |
|---|---|
| `POST /api/agents/[id]/sms` | Replaced by `/whatsapp` |
| `DELETE /api/agents/[id]/sms` | Replaced by `/whatsapp` |
| `POST /api/webhooks/twilio-sms` | Replaced by `/twilio-whatsapp` |

---

## WhatsApp Provisioning Flow

```
NONE → PENDING → APPROVED
               → FAILED (retry available)
```

1. Business owner clicks "Enable WhatsApp" in dashboard
2. App calls Twilio WhatsApp Sender API to register number under VoiceCraft's WAISV account
3. `agent.whatsappStatus` → `PENDING`, `agent.whatsappRegisteredNumber` → current phone number
4. Meta approves → Twilio fires status webhook → `whatsappStatus` → `APPROVED`, `whatsappEnabled` → `true`
5. Twilio WhatsApp inbound webhook configured on the number → `{APP_URL}/api/webhooks/twilio-whatsapp`

**Guard conditions:**
- Agent must have a provisioned phone number
- Agent must be `ACTIVE`
- WhatsApp must not already be `PENDING` or `APPROVED`
- If `whatsappRegisteredNumber` differs from current `phoneNumber`, reset status to `NONE` first

---

## Incoming Message Handling

Twilio delivers WhatsApp messages with `whatsapp:` prefix on both numbers:

```
From: whatsapp:+16505551234
To:   whatsapp:+16505559999
Body: "Can I book a cleaning next Tuesday?"
```

Handler at `/api/webhooks/twilio-whatsapp`:

1. **Validate Twilio signature** using `validateTwilioSignature()` — must happen before any other processing
2. Strip `whatsapp:` prefix → look up agent by number (agent must have `whatsappEnabled = true`)
3. Upsert `Conversation` with `channel: WHATSAPP`
4. Save inbound `Message`
5. Generate AI reply using existing `chatCompletion` + system prompt (reused)
6. Handle booking actions (check availability, book, cancel) — reused entirely
7. Send reply via `sendWhatsApp()` (same Twilio Messages API, `whatsapp:` prefix on sender)
8. Handoff → set `MessagingStatus.NEEDS_REPLY` — reused

**What reuses from existing SMS code:**
- AI reply generation and conversation context
- Action handling (availability, booking, cancellation)
- Rate limiting
- Handoff logic

**What changes:**
- New webhook handler (not a fork of SMS — a clean file that calls shared helpers)
- `sendWhatsApp()` utility (same as `sendSms()` with `whatsapp:` prefix on `From` and `To`)
- System prompt updated to use "WhatsApp" language

---

## Proactive Messages

### Booking confirmation

Triggered after every booking from two paths:

1. **WhatsApp conversation booking** — called directly in the `handleBook` action inside `/api/webhooks/twilio-whatsapp`
2. **Voice call booking** — called inside `/api/webhooks/book/route.ts` after a successful booking; this route gains a `sendWhatsAppConfirmation(agentId, patientPhone, ...)` call

For path 2, if `patientPhone` is not a WhatsApp-registered number (e.g. landline), Twilio returns error code `63016`. The handler must catch this error, log it, and continue without rethrowing — the booking is still valid even if the WhatsApp confirmation cannot be delivered.

### Appointment reminder

Cron job at `/api/cron/appointment-reminders`, protected by timing-safe bearer token check:

```typescript
// Must use crypto.timingSafeEqual() — not string ===
const expected = Buffer.from(process.env.CRON_SECRET ?? '')
const actual = Buffer.from(token)
if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Cron trigger mechanism:** Declared in `vercel.json` if deployed on Vercel; otherwise triggered by an external cron service (e.g. cron-job.org) or a scheduled Docker command. The `Makefile` must document the self-hosted option.

Runs every hour. Queries:
```
scheduledAt between (now + 23h) and (now + 25h)
status = BOOKED
reminderSent = false
agent.whatsappEnabled = true
patientPhone is not null
```

For each match:
- Send `TWILIO_WA_REMINDER_SID` template
- On success → set `reminderSent = true`
- On failure (Twilio error, non-WhatsApp number) → log error, leave `reminderSent = false` so the next hourly run retries

---

## Status + Opt-out Webhook

`POST /api/webhooks/twilio-whatsapp-status` handles two event types from Twilio:

**Sender approval updates:**
- Validate Twilio signature
- If `status = approved` → set `agent.whatsappStatus = APPROVED`, `whatsappEnabled = true`
- If `status = failed` → set `agent.whatsappStatus = FAILED`, `whatsappEnabled = false`

**WhatsApp opt-out events:**
- If event type is `STOP` / opt-out → set `conversation.optedOut = true` for that specific customer's conversation and log
- Opt-out is **per-customer**, not per-agent — the agent's WhatsApp remains active for all other customers
- The inbound handler must check `conversation.optedOut` and silently drop any further messages from that customer
- Respecting opt-outs is required by Meta to avoid account suspension

---

## Messages Dashboard

The existing split-panel messages UI (conversation list left, thread right) is **unchanged structurally**. Updates required:

- `GET /api/messages` — filter by `agent.whatsappEnabled` instead of `agent.smsEnabled`; include `channel` in response
- `POST /api/messages/[conversationId]` — owner reply calls `sendWhatsApp()` for `channel = WHATSAPP` conversations
- UI — replace SMS icon with WhatsApp icon; no layout changes

---

## UI Changes

### Agent detail page
Replace SMS toggle with WhatsApp status card:

| State | Customer sees |
|---|---|
| `NONE` | "Enable WhatsApp — let customers message you on WhatsApp" + Enable button |
| `PENDING` | "Setting up WhatsApp... This usually takes a few hours. We'll notify you when it's ready." |
| `APPROVED` | "WhatsApp is active — customers can now message you" + Disable option |
| `FAILED` | "WhatsApp setup didn't go through. Try again or contact support." + Try Again button |

No technical jargon (no "Meta", "Twilio", "sender registration") visible to customers.

### Appointments page
- Small WhatsApp checkmark on appointments where `reminderSent = true`

---

## Environment Variables

### New variables

```
TWILIO_WA_CONFIRMATION_SID=HX...   # Meta-approved confirmation template SID
TWILIO_WA_REMINDER_SID=HX...       # Meta-approved reminder template SID
CRON_SECRET=...                     # Shared secret for cron route auth (timing-safe comparison)
```

### Removed variables

```
TWILIO_FROM_NUMBER                  # No longer used — WhatsApp sends from the agent's own number
```

`isTwilioConfigured()` in `src/lib/twilio.ts` currently checks for `TWILIO_FROM_NUMBER`. This check must be removed or updated — WhatsApp sends do not require a platform-level from number.

---

## Security

| Concern | Mitigation |
|---|---|
| Forged inbound WhatsApp messages | `validateTwilioSignature()` on all webhook routes before any processing |
| Forged status/opt-out events | `validateTwilioSignature()` on `/api/webhooks/twilio-whatsapp-status` |
| Cron route abuse | `crypto.timingSafeEqual()` bearer token check |
| `whatsapp:` prefix trust | Prefix stripped only after signature validation passes |
| `validateTwilioSignature()` timing gap | The existing implementation uses `===` string comparison (not `timingSafeEqual`). The implementation plan must update `validateTwilioSignature()` in `src/lib/twilio.ts` to use `crypto.timingSafeEqual()` — this benefits all webhook routes (voice and WhatsApp). |

---

## Out of Scope

- WhatsApp media messages (images, documents) — AI replies text-only for now
- Business owner replying via WhatsApp Business app — replies go through VoiceCraft dashboard only
- Multiple reminder times (only 24h before, for now)
- WhatsApp for outbound marketing / bulk messaging
- SMS retained for legacy data only — no new SMS conversations
- `POST /api/webhooks/send-sms` — used by the LiveKit voice agent to send SMS; must be retired or updated to `sendWhatsApp()` as a follow-up; out of scope for this spec but must not be left calling `isTwilioConfigured()` with the removed `TWILIO_FROM_NUMBER`
- `configureNumberSmsWebhook()` in `src/lib/twilio.ts` — becomes dead code after this migration; scheduled for removal
