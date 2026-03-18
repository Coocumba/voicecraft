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
- Patients/customers see the **business's name** in WhatsApp (not "VoiceCraft")
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
> "Hi {{1}}, reminder: your {{2}} appointment with {{3}} is tomorrow at {{4}}. Reply CANCEL to cancel."

Variables: customer name, service, business name, time

---

## Data Model Changes

### Rename SMS models to channel-agnostic names

| Old name | New name |
|---|---|
| `SmsConversation` | `Conversation` |
| `SmsMessage` | `Message` |
| `SmsDirection` | `MessageDirection` |
| `SmsSender` | `MessageSender` |
| `SmsConversationStatus` | `ConversationStatus` |

### New enum and field on `Conversation`

```prisma
enum MessageChannel {
  WHATSAPP
  SMS        // retained so existing data is not orphaned
}

model Conversation {
  // ...existing fields...
  channel  MessageChannel  @default(WHATSAPP)
}
```

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
  whatsappEnabled  Boolean        @default(false)
  whatsappStatus   WhatsAppStatus @default(NONE)
  // smsEnabled removed
}
```

### Appointment model change

```prisma
model Appointment {
  // ...existing fields...
  reminderSent  Boolean  @default(false)
}
```

---

## API Routes

### New routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/agents/[id]/whatsapp` | Enable WhatsApp on agent's number |
| DELETE | `/api/agents/[id]/whatsapp` | Disable WhatsApp |
| POST | `/api/webhooks/twilio-whatsapp` | Inbound WhatsApp message handler |
| POST | `/api/webhooks/twilio-whatsapp-status` | Twilio/Meta approval status updates |
| POST | `/api/cron/appointment-reminders` | Hourly reminder job (cron-protected) |

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
3. `agent.whatsappStatus` → `PENDING`
4. Meta approves → Twilio fires status webhook → `whatsappStatus` → `APPROVED`, `whatsappEnabled` → `true`
5. Twilio WhatsApp inbound webhook configured on the number → `{APP_URL}/api/webhooks/twilio-whatsapp`

**Guard conditions:**
- Agent must have a provisioned phone number
- Agent must be `ACTIVE`
- WhatsApp must not already be `PENDING` or `APPROVED`

---

## Incoming Message Handling

Twilio delivers WhatsApp messages with `whatsapp:` prefix on both numbers:

```
From: whatsapp:+16505551234
To:   whatsapp:+16505559999
Body: "Can I book a cleaning next Tuesday?"
```

Handler at `/api/webhooks/twilio-whatsapp`:

1. Strip `whatsapp:` prefix → look up agent by number
2. Upsert `Conversation` with `channel: WHATSAPP`
3. Save inbound `Message`
4. Generate AI reply using existing `chatCompletion` + system prompt (reused)
5. Handle booking actions (check availability, book, cancel) — reused entirely
6. Send reply via `sendWhatsApp()` (same Twilio Messages API, `whatsapp:` prefix on sender)
7. Handoff → set `ConversationStatus.NEEDS_REPLY` — reused

**What reuses from existing SMS code:**
- AI reply generation and conversation context
- Action handling (availability, booking, cancellation)
- Rate limiting
- Handoff logic

**What changes:**
- New webhook handler (not a fork of SMS — a clean file that calls shared helpers)
- `sendWhatsApp()` utility (same as `sendSms()` with `whatsapp:` prefix)
- System prompt updated to use "WhatsApp" language

---

## Proactive Messages

### Booking confirmation
Triggered after every booking — from WhatsApp conversation handler or voice call booking tool. Sends `TWILIO_WA_CONFIRMATION_SID` template immediately.

### Appointment reminder
Cron job at `/api/cron/appointment-reminders`, protected by `Authorization: Bearer {CRON_SECRET}`.

Runs every hour. Queries:
```
scheduledAt between (now + 23h) and (now + 25h)
status = BOOKED
reminderSent = false
agent.whatsappEnabled = true
patientPhone is not null
```

For each match: send `TWILIO_WA_REMINDER_SID` template → set `reminderSent = true`.

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

### Messages dashboard
- Replace SMS icon with WhatsApp icon on conversation threads
- No structural changes

### Appointments page
- Small WhatsApp checkmark on appointments where `reminderSent = true`

---

## Environment Variables

New variables to add:

```
TWILIO_WA_CONFIRMATION_SID=HX...   # Meta-approved confirmation template SID
TWILIO_WA_REMINDER_SID=HX...       # Meta-approved reminder template SID
CRON_SECRET=...                     # Shared secret for cron route auth
```

---

## Out of Scope

- WhatsApp media messages (images, documents) — AI replies text-only for now
- Clinic owner replying via WhatsApp Business app — replies go through VoiceCraft dashboard only
- Multiple reminder times (only 24h before, for now)
- WhatsApp for outbound marketing / bulk messaging
