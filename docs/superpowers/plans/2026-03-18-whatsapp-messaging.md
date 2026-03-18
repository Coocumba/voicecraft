# WhatsApp Messaging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SMS with WhatsApp as VoiceCraft's single global messaging channel — same phone number handles both voice calls and WhatsApp messages.

**Architecture:** DB models are renamed from SMS-specific to channel-agnostic names, with a `channel` field on `Conversation`. Twilio delivers WhatsApp messages through the same REST API as SMS but with a `whatsapp:` prefix on numbers. Proactive messages (booking confirmations, appointment reminders) use Meta-approved Twilio Content Templates stored as env vars.

**Tech Stack:** Next.js 16 App Router, Prisma + PostgreSQL, Twilio REST API, TypeScript strict mode. Verification via `pnpm type-check` and `pnpm lint` (no test framework currently configured). Manual HTTP testing with curl.

**Spec:** `docs/superpowers/specs/2026-03-18-whatsapp-messaging-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/web/src/lib/whatsapp.ts` | `sendWhatsApp()`, `sendWhatsAppTemplate()`, `configureNumberWhatsAppWebhook()` |
| `apps/web/src/lib/messaging-prompt.ts` | `buildMessagingSystemPrompt()` — channel-agnostic version of sms-prompt.ts |
| `apps/web/src/lib/messaging-actions.ts` | Shared action handlers (check_availability, book, cancel) extracted from twilio-sms — reused by twilio-whatsapp |
| `apps/web/src/app/api/agents/[id]/whatsapp/route.ts` | POST/DELETE — enable and disable WhatsApp on an agent's number |
| `apps/web/src/app/api/webhooks/twilio-whatsapp/route.ts` | Inbound WhatsApp message handler |
| `apps/web/src/app/api/webhooks/twilio-whatsapp-status/route.ts` | Twilio/Meta approval status + opt-out events |
| `apps/web/src/app/api/cron/appointment-reminders/route.ts` | Hourly cron — sends 24h reminder templates |
| `apps/web/src/components/agents/WhatsAppStatusCard.tsx` | Status-aware UI card replacing SMS toggle |

### Modified files
| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Rename SMS models, add `channel`/`optedOut`/`whatsappEnabled`/`whatsappStatus`/`whatsappRegisteredNumber`/`reminderSent` fields |
| `apps/web/src/lib/twilio.ts` | Update `validateTwilioSignature()` to use `timingSafeEqual`; update `isTwilioConfigured()` to drop `TWILIO_FROM_NUMBER`; add `configureNumberWhatsAppWebhook()` |
| `apps/web/src/app/api/messages/route.ts` | Filter by `whatsappEnabled`; owner reply uses `sendWhatsApp()` |
| `apps/web/src/app/api/webhooks/book/route.ts` | Send WhatsApp confirmation after successful booking |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Replace SMS toggle with `<WhatsAppStatusCard>` |
| `apps/web/src/app/dashboard/(shell)/messages/page.tsx` | WhatsApp icon instead of SMS icon |
| `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` | `reminderSent` checkmark |
| `apps/web/.env.example` | Add new vars; remove `TWILIO_FROM_NUMBER` |
| `README.md` | Update messaging section |

### Deleted files
| File | Reason |
|---|---|
| `apps/web/src/app/api/agents/[id]/sms/route.ts` | Replaced by `/whatsapp` |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | Replaced by `twilio-whatsapp` |
| `apps/web/src/lib/sms-prompt.ts` | Replaced by `messaging-prompt.ts` |

---

## Chunk 1: DB Schema + Core Utilities

### Task 1: Update Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Context:** The schema uses `SmsConversation`, `SmsMessage`, `SmsDirection`, `SmsSender`, `SmsConversationStatus`. These need to be renamed to channel-agnostic names. The existing `ConversationStatus` enum (used by `BuilderConversation`) must NOT be renamed — it's a different thing.

- [ ] **Step 1: Open `packages/db/prisma/schema.prisma` and make all changes**

Replace the entire SMS section of the schema (models and enums) with:

```prisma
// ── Messaging (WhatsApp / legacy SMS) ──────────────────────────────────────

enum MessageChannel {
  WHATSAPP
  SMS
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageSender {
  CUSTOMER
  BOT
  OWNER
}

enum MessagingStatus {
  ACTIVE
  NEEDS_REPLY
  RESOLVED
}

enum WhatsAppStatus {
  NONE
  PENDING
  APPROVED
  FAILED
}

model Conversation {
  id            String         @id @default(cuid())
  agentId       String
  agent         Agent          @relation(fields: [agentId], references: [id], onDelete: Cascade)
  customerPhone String
  channel       MessageChannel @default(WHATSAPP)
  optedOut      Boolean        @default(false)
  status        MessagingStatus @default(ACTIVE)
  lastMessageAt DateTime
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  messages      Message[]

  @@unique([agentId, customerPhone, channel])
  @@index([agentId, status])
  @@index([agentId, lastMessageAt])
}

model Message {
  id             String          @id @default(cuid())
  conversationId String
  conversation   Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      MessageDirection
  sender         MessageSender
  body           String
  twilioSid      String?
  createdAt      DateTime        @default(now())

  @@index([conversationId, createdAt])
}
```

Also update the `Agent` model — replace `smsEnabled Boolean @default(false)` and `smsConversations SmsConversation[]` with:

```prisma
  whatsappEnabled          Boolean        @default(false)
  whatsappStatus           WhatsAppStatus @default(NONE)
  whatsappRegisteredNumber String?
  conversations            Conversation[]
```

Also update the `Appointment` model — add after `calendarEventId`:

```prisma
  reminderSent    Boolean   @default(false)
```

And add the compound index on Appointment:

```prisma
  @@index([scheduledAt, status, reminderSent])
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd packages/db
npx prisma migrate dev --name whatsapp_messaging
```

When prompted for migration name, it is already provided. Expected: Prisma generates SQL, applies it, regenerates the client.

**Important:** The generated migration SQL will have `ALTER TABLE` renames. You must manually add this backfill line to the migration SQL file **before** applying (or via a separate migration). The unconditional form is correct — every pre-existing row was an SMS row and must be tagged as such:

```sql
-- Backfill: every existing row was SMS; new rows default to WHATSAPP
UPDATE "Conversation" SET channel = 'SMS';
```

If Prisma has already applied the migration, run it as a second migration:

```bash
npx prisma migrate dev --name backfill_sms_channel
```

With the same SQL:
```sql
UPDATE "Conversation" SET channel = 'SMS';
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
make db-generate
# or: cd packages/db && npx prisma generate
```

- [ ] **Step 4: Run type-check to catch any broken imports**

```bash
cd /path/to/voicecraft
pnpm type-check
```

Expected: Many errors from files still importing old SMS types (`SmsConversation`, `SmsDirection`, etc.). This is expected — the next tasks fix them. If you see unexpected unrelated errors, fix those first.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: rename SMS DB models to channel-agnostic names, add WhatsApp fields"
```

---

### Task 2: Update `validateTwilioSignature` to use timing-safe comparison

**Files:**
- Modify: `apps/web/src/lib/twilio.ts`

**Context:** The current implementation uses `signature === expected` (plain string equality) which is vulnerable to timing attacks. Replace with `crypto.timingSafeEqual()`. Also update `isTwilioConfigured()` — it currently checks for `TWILIO_FROM_NUMBER` which is being removed.

- [ ] **Step 1: Update `validateTwilioSignature` in `apps/web/src/lib/twilio.ts`**

Find the function (around line 291) and replace the final comparison:

```typescript
// Before:
return signature === expected

// After:
const sigBuf = Buffer.from(signature)
const expBuf = Buffer.from(expected)
if (sigBuf.length !== expBuf.length) return false
return crypto.timingSafeEqual(sigBuf, expBuf)
```

- [ ] **Step 2: Update `isTwilioConfigured()`**

```typescript
// Before: checks TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// After: only TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (WhatsApp sends from agent's own number)

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  )
}
```

Note: `isTwilioConfigured()` is now equivalent to `canProvisionNumbers()`. Keep both for clarity — one is named for messaging, one for number provisioning.

- [ ] **Step 3: Add `configureNumberWhatsAppWebhook` to `apps/web/src/lib/twilio.ts`**

**Note on WAISV routing:** Under the Twilio WAISV (ISV) program, inbound WhatsApp message routing is configured on the WhatsApp Sender resource (via `messaging.twilio.com`), not on the `IncomingPhoneNumber` resource. Using `SmsUrl` on `IncomingPhoneNumbers` works for the Twilio Sandbox but may not apply to production WAISV numbers. During implementation, verify the correct Twilio API endpoint in the Twilio WAISV documentation before finalising. The function signature below is correct; the API endpoint may need adjustment:

```typescript
/**
 * Configure the inbound WhatsApp webhook for a registered WhatsApp Sender.
 *
 * For WAISV (production) numbers, Twilio routes inbound WhatsApp messages via
 * the Sender resource webhook, not the IncomingPhoneNumber SmsUrl.
 * Verify the correct API endpoint in Twilio's WAISV docs before deploying.
 *
 * @param numberSid  The Twilio IncomingPhoneNumber SID (e.g. PN...)
 * @param webhookUrl The full URL to our WhatsApp webhook, or null to clear it
 */
export async function configureNumberWhatsAppWebhook(
  numberSid: string,
  webhookUrl: string | null
): Promise<void> {
  // TODO: Verify WAISV routing — this endpoint is correct for Sandbox;
  // production WAISV numbers may require the messaging.twilio.com Sender API.
  const params = new URLSearchParams({
    SmsUrl: webhookUrl ?? "",
    SmsMethod: "POST",
  })

  const res = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio WhatsApp webhook config failed (${res.status}): ${text}`)
  }
}
```

- [ ] **Step 4: Verify `validateTwilioSignature` uses `timingSafeEqual`**

Open `apps/web/src/lib/twilio.ts` and confirm the function now ends with:
```typescript
const sigBuf = Buffer.from(signature)
const expBuf = Buffer.from(expected)
if (sigBuf.length !== expBuf.length) return false
return crypto.timingSafeEqual(sigBuf, expBuf)
```
It must NOT contain `return signature === expected` anywhere. This security fix benefits all webhook routes (voice, WhatsApp, status).

- [ ] **Step 5: Type-check**

```bash
pnpm type-check
```

Expected: No new errors from `twilio.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/twilio.ts
git commit -m "fix: use timingSafeEqual in validateTwilioSignature, remove TWILIO_FROM_NUMBER dependency"
```

---

### Task 3: Create `apps/web/src/lib/whatsapp.ts`

**Files:**
- Create: `apps/web/src/lib/whatsapp.ts`

**Context:** This is the WhatsApp equivalent of `sendSms()`. Twilio's Messages API is identical for WhatsApp — just prefix the `To` and `From` with `whatsapp:`. Templates use Twilio Content API via the `ContentSid` and `ContentVariables` fields.

- [ ] **Step 1: Create `apps/web/src/lib/whatsapp.ts`**

```typescript
// WhatsApp utilities — thin wrappers over the Twilio Messages REST API.
// All numbers must be in E.164 format (e.g. +16505551234).
// Twilio prepends "whatsapp:" internally when the Content-Type is set.
//
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// Template env vars: TWILIO_WA_CONFIRMATION_SID, TWILIO_WA_REMINDER_SID

function twilioBasicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required")
  }
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`
}

function twilioBaseUrl(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID env var is required")
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}`
}

interface TwilioMessageResponse {
  sid: string
  status: string
  error_code?: number
  error_message?: string
}

/**
 * Send a free-form WhatsApp message (valid within a 24h session window).
 *
 * @param to   Recipient in E.164 format
 * @param body Message text
 * @param from Sender in E.164 format (the agent's provisioned number)
 */
export async function sendWhatsApp(
  to: string,
  body: string,
  from: string
): Promise<{ success: boolean; sid?: string }> {
  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    Body: body,
  })

  const res = await fetch(`${twilioBaseUrl()}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const data = (await res.json()) as TwilioMessageResponse

  if (!res.ok) {
    const code = data.error_code ?? res.status
    const message = data.error_message ?? "Unknown Twilio error"
    throw new Error(`WhatsApp message failed [${code}]: ${message}`)
  }

  return { success: true, sid: data.sid }
}

/**
 * Send a Meta-approved template message (works outside the 24h session window).
 * Template variables are passed as an ordered array matching {{1}}, {{2}}, etc.
 *
 * Error 63016 means the recipient's number is not registered on WhatsApp.
 * Callers must handle this gracefully (log and continue — do not rethrow).
 *
 * @param to          Recipient in E.164 format
 * @param from        Sender in E.164 format (the agent's provisioned number)
 * @param contentSid  Twilio Content Template SID (e.g. HX...)
 * @param variables   Ordered array of variable values: ["Sarah", "Cleaning", ...]
 */
export async function sendWhatsAppTemplate(
  to: string,
  from: string,
  contentSid: string,
  variables: string[]
): Promise<{ success: boolean; sid?: string }> {
  // ContentVariables must be JSON: {"1": "val1", "2": "val2", ...}
  const contentVariables = JSON.stringify(
    Object.fromEntries(variables.map((v, i) => [String(i + 1), v]))
  )

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    ContentSid: contentSid,
    ContentVariables: contentVariables,
  })

  const res = await fetch(`${twilioBaseUrl()}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const data = (await res.json()) as TwilioMessageResponse

  if (!res.ok) {
    const code = data.error_code ?? res.status
    const message = data.error_message ?? "Unknown Twilio error"
    throw new Error(`WhatsApp template failed [${code}]: ${message}`)
  }

  return { success: true, sid: data.sid }
}

// No timingSafeEqual export here — cron route uses crypto.timingSafeEqual directly.
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: No errors from `whatsapp.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/whatsapp.ts
git commit -m "feat: add WhatsApp send utilities (sendWhatsApp, sendWhatsAppTemplate)"
```

---

### Task 4: Create `apps/web/src/lib/messaging-prompt.ts` and `messaging-actions.ts`

**Files:**
- Create: `apps/web/src/lib/messaging-prompt.ts`
- Create: `apps/web/src/lib/messaging-actions.ts`

**Context:** `sms-prompt.ts` builds the system prompt for the AI — rename and update to say "WhatsApp" instead of "SMS". `messaging-actions.ts` extracts the action handlers (`handleCheckAvailability`, `handleBook`, `handleCancel`) from `twilio-sms/route.ts` so they can be reused by the new WhatsApp handler without duplication.

- [ ] **Step 1: Create `apps/web/src/lib/messaging-prompt.ts`**

Copy `apps/web/src/lib/sms-prompt.ts` entirely, then:
- Rename the exported function from `buildSmsSystemPrompt` to `buildMessagingSystemPrompt`
- Replace "SMS assistant" with "WhatsApp assistant" in the prompt text
- Replace "SMS reply" with "WhatsApp reply" in the prompt text
- Replace "SMS messages should be brief" with "WhatsApp messages should be conversational but concise"

The full file should look like:

```typescript
import type { AgentConfig, ServiceItem, DayHours } from "@/lib/builder-types"

const DAY_NAMES: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

function formatService(service: ServiceItem): string {
  const parts: string[] = [service.name]
  if (service.duration) parts.push(`${service.duration} min`)
  if (service.price) parts.push(`$${service.price}`)
  return parts.join(" — ")
}

function formatHours(hours: Record<string, DayHours | null>): string {
  const lines: string[] = []
  for (const [day, slot] of Object.entries(hours)) {
    const label = DAY_NAMES[day.toLowerCase()] ?? day
    if (slot === null) {
      lines.push(`  ${label}: Closed`)
    } else {
      lines.push(`  ${label}: ${slot.open} – ${slot.close}`)
    }
  }
  return lines.join("\n")
}

export function buildMessagingSystemPrompt(config: AgentConfig): string {
  const businessName = config.business_name ?? "this business"
  const tone = config.tone ?? "friendly and professional"
  const timezone = config.timezone ?? "America/New_York"

  const servicesSection =
    config.services && config.services.length > 0
      ? `SERVICES OFFERED:\n${config.services.map(formatService).map((s) => `  - ${s}`).join("\n")}`
      : "SERVICES OFFERED:\n  (not specified)"

  const hoursSection =
    config.hours && Object.keys(config.hours).length > 0
      ? `BUSINESS HOURS (${timezone}):\n${formatHours(config.hours)}`
      : `BUSINESS HOURS:\n  (not specified)`

  const canBook = config.can_book_appointments === true

  return `You are a WhatsApp assistant for ${businessName}. Your job is to help customers via WhatsApp messages.

TONE: ${tone}

${servicesSection}

${hoursSection}

CAPABILITIES:
${canBook ? "  - You CAN check appointment availability and book appointments." : "  - You cannot book appointments — direct customers to call if they need scheduling."}
  - You can answer questions about services, pricing, and hours.
  - If you cannot help or the customer is upset, set handoff to true so a human can follow up.

RESPONSE FORMAT:
You must ALWAYS respond with valid JSON in this exact format:
{
  "reply": "<your WhatsApp reply to the customer — conversational but concise>",
  "handoff": <true if a human should follow up, false otherwise>,
  "action": <"check_availability" | "book" | "cancel" | null>,
  "actionData": <object with relevant data for the action, or omit if action is null>
}

RULES:
- Keep replies conversational and concise.
- Never reveal that you are an AI unless directly asked.
- If asked about something outside your knowledge, say you'll have someone follow up (set handoff: true).
- For appointment booking, use action "check_availability" first to confirm a slot is open, then "book" to confirm.
- Always be polite and represent ${businessName} professionally.
- Do not include any text outside the JSON object in your response.`
}
```

- [ ] **Step 2: Create `apps/web/src/lib/messaging-actions.ts`**

Extract the action handlers from `apps/web/src/app/api/webhooks/twilio-sms/route.ts`. These are the `handleCheckAvailability`, `handleBook`, `handleCancel` functions. They need to be made generic (accept a `sendReply` callback instead of calling `sendFollowUp` directly).

```typescript
// Shared action handlers for WhatsApp conversations.
// Handles check_availability, book, and cancel actions triggered by the AI response.

import {
  prisma,
  MessageSender,
  MessageDirection,
  AppointmentStatus,
} from "@voicecraft/db"
import { getCalendarEventsForDate, bookAppointment, deleteCalendarEvent } from "@/lib/calendar"
import { getDayName } from "@/lib/timezone-utils"
import { generateSlots } from "@/lib/slot-generator"
import type { AgentConfig } from "@/lib/builder-types"

// The sendReply callback MUST both save the message to prisma.message AND send it.
// Any implementation of SendReply must write to prisma.message with
// direction: MessageDirection.OUTBOUND and sender: MessageSender.BOT BEFORE sending,
// otherwise action follow-up messages will not appear in the conversation thread.
type SendReply = (conversationId: string, to: string, from: string, body: string) => Promise<void>

export async function handleAction(
  action: "check_availability" | "book" | "cancel",
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  try {
    switch (action) {
      case "check_availability":
        await handleCheckAvailability(actionData, agent, conversationId, customerPhone, agentPhone, config, sendReply)
        break
      case "book":
        await handleBook(actionData, agent, conversationId, customerPhone, agentPhone, config, sendReply)
        break
      case "cancel":
        await handleCancel(agent, conversationId, customerPhone, agentPhone, sendReply)
        break
    }
  } catch (err) {
    console.error(`[messaging-actions] Action "${action}" failed`, err)
  }
}

async function handleCheckAvailability(
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  const date = actionData.date
  if (!date) return

  const timezone = config.timezone ?? "America/New_York"
  const dayName = getDayName(date, timezone)

  const dayHours = config.hours?.[dayName] ?? null
  if (!dayHours) {
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we're closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s. Please choose another day.`
    )
    return
  }

  const defaultDuration =
    config.services && config.services.length > 0 ? config.services[0]!.duration : 30
  const allSlots = generateSlots(date, dayHours.open, dayHours.close, defaultDuration, timezone)

  let availableSlots = allSlots
  try {
    const events = await getCalendarEventsForDate(agent.userId, date, timezone)
    availableSlots = allSlots.filter((slotIso) => {
      const slotStart = new Date(slotIso).getTime()
      const slotEnd = slotStart + defaultDuration * 60 * 1000
      return !events.some((e) => slotStart < e.end.getTime() && slotEnd > e.start.getTime())
    })
  } catch (err) {
    console.warn("[messaging-actions] Calendar check failed, showing all slots", err)
  }

  if (availableSlots.length === 0) {
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      `Sorry, we don't have any availability on ${date}. Would you like to try a different day?`
    )
    return
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const timeList = availableSlots.slice(0, 8).map((iso) => formatter.format(new Date(iso))).join(", ")
  const moreText = availableSlots.length > 8 ? ` (and ${availableSlots.length - 8} more)` : ""

  await sendReply(
    conversationId,
    customerPhone,
    agentPhone,
    `Available times on ${date}: ${timeList}${moreText}. Which works best for you?`
  )
}

async function handleBook(
  actionData: Record<string, string>,
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  config: AgentConfig,
  sendReply: SendReply
): Promise<void> {
  const { date, time, patientName, service } = actionData
  if (!date || !time || !patientName || !service) return

  const timezone = config.timezone ?? "America/New_York"
  const scheduledAt = new Date(`${date}T${time}`)
  if (isNaN(scheduledAt.getTime())) {
    console.error("[messaging-actions] Invalid booking datetime", { date, time })
    return
  }

  const appointment = await prisma.appointment.create({
    data: {
      agentId: agent.id,
      patientName,
      patientPhone: customerPhone,
      scheduledAt,
      service,
      status: AppointmentStatus.BOOKED,
    },
  })

  try {
    const defaultDuration =
      config.services?.find((s) => s.name.toLowerCase() === service.toLowerCase())?.duration ?? 30
    const result = await bookAppointment(agent.userId, {
      patientName,
      patientPhone: customerPhone,
      scheduledAt: scheduledAt.toISOString(),
      service,
      durationMinutes: defaultDuration,
    })
    if (result) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { calendarEventId: result.eventId },
      })
    }
  } catch (err) {
    console.warn("[messaging-actions] Calendar sync failed (non-fatal)", err)
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  await sendReply(
    conversationId,
    customerPhone,
    agentPhone,
    `Your ${service} appointment is confirmed for ${formatter.format(scheduledAt)}. See you then!`
  )
}

async function handleCancel(
  agent: { id: string; userId: string; config: unknown },
  conversationId: string,
  customerPhone: string,
  agentPhone: string,
  sendReply: SendReply
): Promise<void> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      agentId: agent.id,
      patientPhone: customerPhone,
      status: AppointmentStatus.BOOKED,
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
  })

  if (!appointment) {
    await sendReply(
      conversationId,
      customerPhone,
      agentPhone,
      "We couldn't find an upcoming appointment to cancel. Please call us if you need further assistance."
    )
    return
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  })

  if (appointment.calendarEventId) {
    try {
      await deleteCalendarEvent(agent.userId, appointment.calendarEventId)
    } catch (err) {
      console.warn("[messaging-actions] Calendar event deletion failed (non-fatal)", err)
    }
  }

  await sendReply(
    conversationId,
    customerPhone,
    agentPhone,
    "Your appointment has been cancelled. Let us know if you'd like to reschedule."
  )
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: No errors from the new files. There will still be errors in other files until they are updated.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/messaging-prompt.ts apps/web/src/lib/messaging-actions.ts
git commit -m "feat: add channel-agnostic messaging prompt and action handlers"
```

---

## Chunk 2: WhatsApp Provisioning + Status Webhook

### Task 5: Create `POST/DELETE /api/agents/[id]/whatsapp`

**Files:**
- Create: `apps/web/src/app/api/agents/[id]/whatsapp/route.ts`

**Context:** This replaces `apps/web/src/app/api/agents/[id]/sms/route.ts`. The POST handler registers the agent's number as a WhatsApp sender via Twilio's API and sets `whatsappStatus = PENDING`. The DELETE handler disables WhatsApp and clears the webhook. Look at the existing `sms/route.ts` for the pattern to follow.

Twilio's WhatsApp Sender Registration API (WAISV path):
```
POST https://messaging.twilio.com/v1/WhatsApp/SenderRequests
Body: PhoneNumber=+1XXXXXXXXX
```

- [ ] **Step 1: Create `apps/web/src/app/api/agents/[id]/whatsapp/route.ts`**

```typescript
import { auth } from "@/auth"
import { prisma, WhatsAppStatus, AgentStatus } from "@voicecraft/db"
import { configureNumberWhatsAppWebhook } from "@/lib/twilio"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Enable WhatsApp on an agent's provisioned number.
 *
 * Registers the number with Twilio's WhatsApp Sender API under VoiceCraft's
 * WAISV account. Sets whatsappStatus = PENDING until Meta approves.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (!agent.phoneNumber || !agent.phoneNumberSid) {
      return Response.json(
        { error: "Agent must have a provisioned phone number to enable WhatsApp" },
        { status: 400 }
      )
    }
    if (agent.status !== AgentStatus.ACTIVE) {
      return Response.json({ error: "Agent must be active to enable WhatsApp" }, { status: 400 })
    }
    if (agent.whatsappStatus === WhatsAppStatus.PENDING || agent.whatsappStatus === WhatsAppStatus.APPROVED) {
      return Response.json({ error: "WhatsApp is already enabled or pending" }, { status: 409 })
    }

    // Register with Twilio WhatsApp Sender API
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    if (!twilioSid || !twilioToken) {
      return Response.json({ error: "Twilio is not configured" }, { status: 503 })
    }

    const senderRes = await fetch("https://messaging.twilio.com/v1/WhatsApp/SenderRequests", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ PhoneNumber: agent.phoneNumber }).toString(),
    })

    if (!senderRes.ok) {
      const text = await senderRes.text()
      console.error("[whatsapp] Twilio sender registration failed", { status: senderRes.status, text })
      return Response.json({ error: "WhatsApp registration failed. Please try again." }, { status: 502 })
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        whatsappStatus: WhatsAppStatus.PENDING,
        whatsappRegisteredNumber: agent.phoneNumber,
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[POST /api/agents/:id/whatsapp]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE — Disable WhatsApp on an agent.
 *
 * Clears the WhatsApp webhook on the Twilio number and resets agent status.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const agent = await prisma.agent.findUnique({ where: { id } })

    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })
    if (!agent.whatsappEnabled && agent.whatsappStatus === WhatsAppStatus.NONE) {
      return Response.json({ error: "WhatsApp is not enabled" }, { status: 409 })
    }

    // Clear WhatsApp webhook on Twilio number (skip on localhost)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost") && agent.phoneNumberSid) {
      await configureNumberWhatsAppWebhook(agent.phoneNumberSid, null)
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        whatsappEnabled: false,
        whatsappStatus: WhatsAppStatus.NONE,
        whatsappRegisteredNumber: null,
      },
    })

    return Response.json({ agent: updated })
  } catch (err) {
    console.error("[DELETE /api/agents/:id/whatsapp]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/agents/[id]/whatsapp/route.ts
git commit -m "feat: add POST/DELETE /api/agents/[id]/whatsapp for WhatsApp provisioning"
```

---

### Task 6: Create `/api/webhooks/twilio-whatsapp-status`

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio-whatsapp-status/route.ts`

**Context:** Twilio POSTs to this endpoint when Meta approves or rejects a WhatsApp sender registration, and also when a customer opts out. Must validate Twilio signature first. Look at how `twilio-voice/route.ts` validates signatures for the pattern.

- [ ] **Step 1: Create `apps/web/src/app/api/webhooks/twilio-whatsapp-status/route.ts`**

```typescript
import { prisma, WhatsAppStatus } from "@voicecraft/db"
import { validateTwilioSignature } from "@/lib/twilio"
import { configureNumberWhatsAppWebhook } from "@/lib/twilio"

/**
 * POST /api/webhooks/twilio-whatsapp-status
 *
 * Handles two event types from Twilio:
 * 1. WhatsApp sender approval/rejection — updates agent.whatsappStatus
 * 2. Customer opt-out (STOP) — sets conversation.optedOut = true
 *
 * All requests are validated with Twilio signature before processing.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = String(value) })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl ? `${appUrl}/api/webhooks/twilio-whatsapp-status` : request.url

  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-whatsapp-status] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  const eventType = params["EventType"] ?? ""
  const phoneNumber = params["PhoneNumber"] ?? params["To"] ?? null

  // ── Sender approval/rejection ──────────────────────────────────────────
  if (eventType === "onWhatsAppSenderRequestApproved" || params["SenderStatus"]) {
    const status = params["SenderStatus"] ?? (eventType.includes("Approved") ? "approved" : "failed")
    const isApproved = status === "approved"

    if (!phoneNumber) {
      console.warn("[twilio-whatsapp-status] No phone number in sender status event")
      return new Response("OK", { status: 200 })
    }

    const agent = await prisma.agent.findFirst({
      where: { whatsappRegisteredNumber: phoneNumber },
    })

    if (!agent) {
      console.warn("[twilio-whatsapp-status] No agent found for number", { phoneNumber })
      return new Response("OK", { status: 200 })
    }

    if (isApproved) {
      // Configure the WhatsApp inbound webhook on the Twilio number
      const appUrlForWebhook = process.env.NEXT_PUBLIC_APP_URL
      if (appUrlForWebhook && !appUrlForWebhook.includes("localhost") && agent.phoneNumberSid) {
        await configureNumberWhatsAppWebhook(
          agent.phoneNumberSid,
          `${appUrlForWebhook}/api/webhooks/twilio-whatsapp`
        )
      }

      await prisma.agent.update({
        where: { id: agent.id },
        data: { whatsappStatus: WhatsAppStatus.APPROVED, whatsappEnabled: true },
      })

      console.info("[twilio-whatsapp-status] WhatsApp approved", { agentId: agent.id, phoneNumber })
    } else {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { whatsappStatus: WhatsAppStatus.FAILED, whatsappEnabled: false },
      })

      console.warn("[twilio-whatsapp-status] WhatsApp rejected", { agentId: agent.id, phoneNumber, status })
    }

    return new Response("OK", { status: 200 })
  }

  // ── Customer opt-out ───────────────────────────────────────────────────
  const from = params["From"] ?? ""
  const to = params["To"] ?? ""
  const body = (params["Body"] ?? "").trim().toUpperCase()

  if (body === "STOP" || eventType === "STOP") {
    // Strip whatsapp: prefix
    const customerPhone = from.replace(/^whatsapp:/, "")
    const agentPhone = to.replace(/^whatsapp:/, "")

    if (customerPhone && agentPhone) {
      await prisma.conversation.updateMany({
        where: { customerPhone, agent: { phoneNumber: agentPhone } },
        data: { optedOut: true },
      })
      console.info("[twilio-whatsapp-status] Customer opted out", { customerPhone, agentPhone })
    }
  }

  return new Response("OK", { status: 200 })
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio-whatsapp-status/route.ts
git commit -m "feat: add WhatsApp status/opt-out webhook handler"
```

---

## Chunk 3: Inbound Message Handler

### Task 7: Create `/api/webhooks/twilio-whatsapp`

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio-whatsapp/route.ts`

**Context:** This is the main WhatsApp message handler. Twilio POSTs here when a customer sends a WhatsApp message. It must: validate signature → check opt-out → upsert conversation → save message → generate AI reply → send reply → handle actions. It reuses `buildMessagingSystemPrompt` from `messaging-prompt.ts`, `handleAction` from `messaging-actions.ts`, and `chatCompletion` + `parseSmsResponse` from their existing locations.

Check `apps/web/src/lib/llm.ts` for `chatCompletion` and `apps/web/src/lib/sms-response-parser.ts` for `parseSmsResponse`.

- [ ] **Step 1: Create `apps/web/src/app/api/webhooks/twilio-whatsapp/route.ts`**

```typescript
import {
  prisma,
  MessagingStatus,
  MessageDirection,
  MessageSender,
  MessageChannel,
} from "@voicecraft/db"
import { validateTwilioSignature } from "@/lib/twilio"
import { sendWhatsApp } from "@/lib/whatsapp"
import { chatCompletion } from "@/lib/llm"
import { buildMessagingSystemPrompt } from "@/lib/messaging-prompt"
import { parseSmsResponse } from "@/lib/sms-response-parser"
import { handleAction } from "@/lib/messaging-actions"
import { rateLimit } from "@/lib/rate-limit"
import type { AgentConfig } from "@/lib/builder-types"

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function twimlResponse() {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

/**
 * POST /api/webhooks/twilio-whatsapp
 *
 * Inbound WhatsApp message from a customer. Twilio delivers this with
 * From/To in the format: whatsapp:+E164
 */
export async function POST(request: Request) {
  // ── 1. Validate Twilio signature ────────────────────────────────────────
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = String(value) })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl ? `${appUrl}/api/webhooks/twilio-whatsapp` : request.url

  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-whatsapp] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  // ── 2. Parse numbers (strip whatsapp: prefix) ───────────────────────────
  const customerPhone = (params["From"] ?? "").replace(/^whatsapp:/, "")
  const agentPhone = (params["To"] ?? "").replace(/^whatsapp:/, "")
  const body = (params["Body"] ?? "").trim()
  const twilioSid = params["MessageSid"] ?? null

  if (!customerPhone || !agentPhone) {
    console.warn("[twilio-whatsapp] Missing From or To", params)
    return twimlResponse()
  }

  // ── 3. Rate limit ────────────────────────────────────────────────────────
  const rl = rateLimit(`wa:${customerPhone}`, { limit: 10, windowMs: 5 * 60 * 1000 })
  if (!rl.success) {
    console.warn("[twilio-whatsapp] Rate limited", { customerPhone })
    return twimlResponse()
  }

  // ── 4. Look up agent ─────────────────────────────────────────────────────
  const agent = await prisma.agent.findFirst({
    where: { phoneNumber: agentPhone, whatsappEnabled: true },
  })

  if (!agent) {
    console.warn("[twilio-whatsapp] No WhatsApp-enabled agent for number", { agentPhone })
    return twimlResponse()
  }

  // ── 5. Find or create conversation (without updating status yet) ──────────
  // We must check opt-out BEFORE mutating status/lastMessageAt, so we use
  // findFirst + conditional create rather than a plain upsert.
  let conversation = await prisma.conversation.findUnique({
    where: {
      agentId_customerPhone_channel: {
        agentId: agent.id,
        customerPhone,
        channel: MessageChannel.WHATSAPP,
      },
    },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        agentId: agent.id,
        customerPhone,
        channel: MessageChannel.WHATSAPP,
        lastMessageAt: new Date(),
        status: MessagingStatus.ACTIVE,
      },
    })
  }

  // ── 6. Check opt-out BEFORE mutating conversation ─────────────────────────
  if (conversation.optedOut) {
    console.info("[twilio-whatsapp] Customer opted out, dropping message", { customerPhone })
    return twimlResponse()
  }

  // Update status and timestamp now that we know the customer is not opted out
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: MessagingStatus.ACTIVE },
  })

  // ── 7. Save inbound message ──────────────────────────────────────────────
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      sender: MessageSender.CUSTOMER,
      body: body || "(media message)",
      twilioSid,
    },
  })

  // ── 8. Handle media-only messages ────────────────────────────────────────
  if (!body) {
    try {
      await sendAndSave(conversation.id, customerPhone, agentPhone, "We can only respond to text messages at this time.")
    } catch (err) {
      console.error("[twilio-whatsapp] Failed to send media fallback", err)
    }
    return twimlResponse()
  }

  // ── 9. Generate AI reply ─────────────────────────────────────────────────
  try {
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
    recentMessages.reverse()

    const config = agent.config as AgentConfig
    const systemPrompt = buildMessagingSystemPrompt(config)

    const llmMessages = recentMessages.map((m) => ({
      role: (m.sender === MessageSender.CUSTOMER ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }))

    const llmResponse = await chatCompletion({ system: systemPrompt, messages: llmMessages, maxTokens: 512 })
    const parsed = parseSmsResponse(llmResponse.content)

    // Save bot reply
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.BOT,
        body: parsed.reply,
      },
    })

    // Send reply
    await sendWhatsApp(customerPhone, parsed.reply, agentPhone)

    // Handle handoff
    if (parsed.handoff) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: MessagingStatus.NEEDS_REPLY },
      })
    }

    // Handle booking/availability/cancel actions
    if (parsed.action && parsed.actionData) {
      await handleAction(
        parsed.action,
        parsed.actionData,
        agent,
        conversation.id,
        customerPhone,
        agentPhone,
        config,
        sendAndSave
      )
    }

    return twimlResponse()
  } catch (err) {
    console.error("[twilio-whatsapp] Error generating AI response", err)

    try {
      await sendAndSave(
        conversation.id,
        customerPhone,
        agentPhone,
        "Thanks for your message! We'll get back to you shortly."
      )
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: MessagingStatus.NEEDS_REPLY },
      })
    } catch (fallbackErr) {
      console.error("[twilio-whatsapp] Fallback also failed", fallbackErr)
    }

    return twimlResponse()
  }
}

/**
 * Save an outbound message to the DB and send it via WhatsApp.
 */
async function sendAndSave(
  conversationId: string,
  to: string,
  from: string,
  body: string
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      direction: MessageDirection.OUTBOUND,
      sender: MessageSender.BOT,
      body,
    },
  })
  await sendWhatsApp(to, body, from)
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: The main handler compiles cleanly. Errors in other files (messages/route.ts still using old model names) are OK for now.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio-whatsapp/route.ts
git commit -m "feat: add inbound WhatsApp message handler"
```

---

### Task 8: Update `/api/messages/route.ts`

**Files:**
- Modify: `apps/web/src/app/api/messages/route.ts`

**Context:** This file currently uses `SmsConversation`, `SmsDirection`, `SmsSender`, `SmsConversationStatus`, `sendSms`. All must be updated to the renamed models and WhatsApp send function.

- [ ] **Step 1: Rewrite `apps/web/src/app/api/messages/route.ts`**

```typescript
import { auth } from "@/auth"
import {
  prisma,
  MessagingStatus,
  MessageDirection,
  MessageSender,
  MessageChannel,
} from "@voicecraft/db"
import { sendWhatsApp } from "@/lib/whatsapp"

/**
 * GET /api/messages
 *
 * List WhatsApp conversations for the current user's WhatsApp-enabled agents.
 * Supports optional query params:
 *   - agentId: filter by a specific agent
 *   - countOnly=true: return just { needsReplyCount } for TopBar badge
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get("agentId")
  const countOnly = searchParams.get("countOnly") === "true"

  try {
    const agentFilter: Record<string, unknown> = {
      userId: session.user.id,
      whatsappEnabled: true,
    }
    if (agentId) {
      agentFilter.id = agentId
    }

    if (countOnly) {
      const needsReplyCount = await prisma.conversation.count({
        where: {
          agent: agentFilter,
          status: MessagingStatus.NEEDS_REPLY,
          channel: MessageChannel.WHATSAPP,
        },
      })
      return Response.json({ needsReplyCount })
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        agent: agentFilter,
        channel: MessageChannel.WHATSAPP,
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        agent: {
          select: { id: true, name: true, businessName: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, sender: true, createdAt: true },
        },
      },
    })

    return Response.json({ conversations })
  } catch (err) {
    console.error("[GET /api/messages]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/messages
 *
 * Send an owner reply to a WhatsApp conversation.
 * Body: { conversationId, body }
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { conversationId, body } = payload as Record<string, unknown>

  if (typeof conversationId !== "string" || !conversationId) {
    return Response.json({ error: "conversationId is required" }, { status: 400 })
  }
  if (typeof body !== "string" || !body.trim()) {
    return Response.json({ error: "body is required" }, { status: 400 })
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: {
          select: { userId: true, phoneNumber: true },
        },
      },
      // optedOut is on Conversation directly (not on the agent include)
    })

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 })
    }
    if (conversation.agent.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!conversation.agent.phoneNumber) {
      return Response.json({ error: "Agent has no phone number configured" }, { status: 400 })
    }
    if (conversation.optedOut) {
      return Response.json({ error: "Customer has opted out of messages" }, { status: 400 })
    }

    await sendWhatsApp(conversation.customerPhone, body.trim(), conversation.agent.phoneNumber)

    const message = await prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.OWNER,
        body: body.trim(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: MessagingStatus.ACTIVE,
        lastMessageAt: new Date(),
      },
    })

    return Response.json({ message })
  } catch (err) {
    console.error("[POST /api/messages]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Check if `/api/messages/[conversationId]/route.ts` uses old model names**

```bash
grep -n "SmsMessage\|SmsConversation\|smsMessage\|smsConversation" apps/web/src/app/api/messages/\[conversationId\]/route.ts
```

If it does, update the model names to `Message` and `Conversation`.

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/messages/route.ts apps/web/src/app/api/messages/\[conversationId\]/route.ts
git commit -m "fix: update messages API to use renamed models and sendWhatsApp"
```

---

## Chunk 4: Proactive Messages

### Task 9: Update `/api/webhooks/book` to send WhatsApp confirmation

**Files:**
- Modify: `apps/web/src/app/api/webhooks/book/route.ts`

**Context:** After an appointment is successfully created, send a WhatsApp booking confirmation template. The patient's phone comes from `patientPhone` in the request body. The agent's number is used as the `from`. Use `TWILIO_WA_CONFIRMATION_SID` env var. Error 63016 = non-WhatsApp number — must catch and log, not rethrow.

- [ ] **Step 1: Add WhatsApp confirmation send after appointment creation in `/api/webhooks/book/route.ts`**

After the `prisma.appointment.create(...)` call (currently line 104), add:

```typescript
// Send WhatsApp confirmation (non-fatal — patient may not have WhatsApp)
if (typeof patientPhone === "string" && patientPhone.trim() && agent.phoneNumber) {
  const confirmationSid = process.env.TWILIO_WA_CONFIRMATION_SID
  if (confirmationSid && agent.whatsappEnabled) {
    try {
      const { sendWhatsAppTemplate } = await import("@/lib/whatsapp")
      const scheduledDate = new Date(scheduledAt as string)
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
      const timeFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true,
      })
      await sendWhatsAppTemplate(
        (patientPhone as string).trim(),
        agent.phoneNumber,
        confirmationSid,
        [
          (patientName as string).trim(),          // {{1}} customer name
          (service as string).trim(),               // {{2}} service
          agent.businessName,                       // {{3}} business name
          dateFormatter.format(scheduledDate),      // {{4}} date (e.g. "Monday, April 7")
          timeFormatter.format(scheduledDate),      // {{5}} time (e.g. "2:00 PM")
        ]
      )
    } catch (err: unknown) {
      // 63016 = recipient not on WhatsApp — expected for landlines, log only
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("63016")) {
        console.info("[book] Patient not on WhatsApp, skipping confirmation", { patientPhone })
      } else {
        console.warn("[book] WhatsApp confirmation failed (non-fatal)", err)
      }
    }
  }
}
```

Also update the agent lookup to include `whatsappEnabled` and `businessName`:

```typescript
// Change the findUnique select to include whatsappEnabled and businessName:
const agent = await prisma.agent.findUnique({
  where: { id: agentId },
  // No select — fetch full agent to access whatsappEnabled, phoneNumber, businessName
})
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/book/route.ts
git commit -m "feat: send WhatsApp booking confirmation after voice call appointment"
```

---

### Task 10: Create appointment reminder cron

**Files:**
- Create: `apps/web/src/app/api/cron/appointment-reminders/route.ts`

**Context:** Runs hourly. Finds appointments scheduled 23–25 hours from now, with `status = BOOKED`, `reminderSent = false`, and the agent having `whatsappEnabled = true`. Sends the `TWILIO_WA_REMINDER_SID` template. Sets `reminderSent = true` only on success. Protected by `CRON_SECRET` bearer token using `timingSafeEqual`.

- [ ] **Step 1: Create `apps/web/src/app/api/cron/appointment-reminders/route.ts`**

```typescript
import crypto from "crypto"
import { prisma, AppointmentStatus } from "@voicecraft/db"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"

/**
 * POST /api/cron/appointment-reminders
 *
 * Hourly cron job — sends WhatsApp reminder templates to customers
 * whose appointments are 23–25 hours away.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 *
 * Trigger options:
 *  - Vercel: add to vercel.json crons
 *  - Self-hosted: call via cron-job.org or Docker scheduled command
 *    e.g. docker exec voicecraft-web curl -X POST http://localhost:3000/api/cron/appointment-reminders \
 *         -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Supports two auth paths:
  // 1. Bearer token (self-hosted, curl): Authorization: Bearer {CRON_SECRET}
  // 2. Vercel cron: Vercel sets Authorization: Bearer {VERCEL_AUTOMATION_BYPASS_SECRET}
  //    OR checks the special header x-vercel-signature.
  //    Simplest Vercel approach: check VERCEL_AUTOMATION_BYPASS_SECRET env var.
  const authHeader = request.headers.get("Authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const secret = process.env.CRON_SECRET ?? ""
  // On Vercel, the cron runner automatically sets the bearer token to CRON_SECRET
  // when CRON_SECRET is configured as an env var in the Vercel project settings.
  // See: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

  const tokenBuf = Buffer.from(token)
  const secretBuf = Buffer.from(secret)
  const isValid = secret.length > 0 &&
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf)
  if (!isValid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reminderSid = process.env.TWILIO_WA_REMINDER_SID
  if (!reminderSid) {
    console.error("[cron/reminders] TWILIO_WA_REMINDER_SID not configured")
    return Response.json({ error: "Reminder template not configured" }, { status: 503 })
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: AppointmentStatus.BOOKED,
      reminderSent: false,
      patientPhone: { not: null },
      agent: { whatsappEnabled: true },
    },
    include: {
      agent: {
        select: { phoneNumber: true, businessName: true, config: true },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const appt of appointments) {
    if (!appt.patientPhone || !appt.agent.phoneNumber) continue

    try {
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
      const timeFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true,
      })

      await sendWhatsAppTemplate(
        appt.patientPhone,
        appt.agent.phoneNumber,
        reminderSid,
        [
          appt.patientName,                           // {{1}} customer name
          appt.service,                                // {{2}} service
          appt.agent.businessName,                     // {{3}} business name
          dateFormatter.format(appt.scheduledAt),      // {{4}} date (e.g. "Monday, April 7")
          timeFormatter.format(appt.scheduledAt),      // {{5}} time (e.g. "2:00 PM")
        ]
      )

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSent: true },
      })

      sent++
    } catch (err: unknown) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("63016")) {
        console.info("[cron/reminders] Patient not on WhatsApp, skipping", { apptId: appt.id })
        // Intentional deviation from spec: spec says leave reminderSent = false for retries,
        // but for non-WhatsApp numbers (63016) retrying every hour is pointless and noisy.
        // We mark as sent to suppress future attempts. The appointment itself is unaffected.
        await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSent: true } })
      } else {
        console.error("[cron/reminders] Failed to send reminder", { apptId: appt.id, err })
        // Leave reminderSent = false so next hourly run retries
      }
    }
  }

  console.info("[cron/reminders] Done", { total: appointments.length, sent, failed })
  return Response.json({ total: appointments.length, sent, failed })
}
```

- [ ] **Step 2: Add cron configuration for self-hosted (add to Makefile)**

Open `Makefile` and add:

```makefile
## Send appointment reminders (run hourly via cron)
cron-reminders:
	curl -s -X POST http://localhost:3000/api/cron/appointment-reminders \
		-H "Authorization: Bearer $${CRON_SECRET}" | jq .
```

- [ ] **Step 3: Add Vercel cron config (if deploying to Vercel)**

Create `apps/web/vercel.json` if it doesn't exist, or add to it:

```json
{
  "crons": [
    {
      "path": "/api/cron/appointment-reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```

Note: For Vercel, set `CRON_SECRET` as an env var in Vercel project settings. Vercel's cron runner automatically sends `Authorization: Bearer {CRON_SECRET}` matching how this route authenticates. No additional changes are needed for Vercel deployment.

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/cron/appointment-reminders/route.ts Makefile
git commit -m "feat: add hourly WhatsApp appointment reminder cron job"
```

---

## Chunk 5: UI + Cleanup

### Task 11: Create `WhatsAppStatusCard` component

**Files:**
- Create: `apps/web/src/components/agents/WhatsAppStatusCard.tsx`

**Context:** Replaces the SMS toggle in the agent detail page. Shows status-aware UI based on `agent.whatsappStatus`. Uses `cn()` from `@/lib/utils`. Follows the design system: `bg-white`, `border-border`, `text-ink`, `text-muted`, `text-accent`, `text-success` colors. No technical jargon visible to the user.

- [ ] **Step 1: Create `apps/web/src/components/agents/WhatsAppStatusCard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface WhatsAppStatusCardProps {
  agentId: string
  whatsappStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'FAILED'
  whatsappEnabled: boolean
  hasPhoneNumber: boolean
  isActive: boolean
}

export function WhatsAppStatusCard({
  agentId,
  whatsappStatus,
  whatsappEnabled,
  hasPhoneNumber,
  isActive,
}: WhatsAppStatusCardProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(whatsappStatus)
  const [enabled, setEnabled] = useState(whatsappEnabled)

  async function handleEnable() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, { method: 'POST' })
      if (res.ok) setStatus('PENDING')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, { method: 'DELETE' })
      if (res.ok) { setStatus('NONE'); setEnabled(false) }
    } finally {
      setLoading(false)
    }
  }

  const canEnable = hasPhoneNumber && isActive && (status === 'NONE' || status === 'FAILED')

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* WhatsApp icon */}
          <div className="w-9 h-9 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink">WhatsApp</h3>
            <StatusLabel status={status} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === 'APPROVED' && enabled && (
            <button
              onClick={() => void handleDisable()}
              disabled={loading}
              className="text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              Disable
            </button>
          )}
          {canEnable && (
            <button
              onClick={() => void handleEnable()}
              disabled={loading}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                'bg-accent text-white border-accent hover:bg-accent/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? 'Setting up...' : status === 'FAILED' ? 'Try again' : 'Enable'}
            </button>
          )}
        </div>
      </div>

      <StatusDescription status={status} hasPhoneNumber={hasPhoneNumber} isActive={isActive} />
    </div>
  )
}

function StatusLabel({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return <p className="text-xs text-success mt-0.5">● Active</p>
  }
  if (status === 'PENDING') {
    return <p className="text-xs text-muted mt-0.5">○ Setting up...</p>
  }
  if (status === 'FAILED') {
    return <p className="text-xs text-red-500 mt-0.5">● Setup failed</p>
  }
  return <p className="text-xs text-muted mt-0.5">○ Not set up</p>
}

function StatusDescription({
  status,
  hasPhoneNumber,
  isActive,
}: {
  status: string
  hasPhoneNumber: boolean
  isActive: boolean
}) {
  if (!hasPhoneNumber || !isActive) {
    return (
      <p className="text-xs text-muted mt-3">
        Deploy your agent and provision a phone number to enable WhatsApp.
      </p>
    )
  }
  if (status === 'APPROVED') {
    return (
      <p className="text-xs text-muted mt-3">
        Customers can call or message you on WhatsApp at your number.
      </p>
    )
  }
  if (status === 'PENDING') {
    return (
      <p className="text-xs text-muted mt-3">
        Setting up WhatsApp... This usually takes a few hours. We&apos;ll update this page when it&apos;s ready.
      </p>
    )
  }
  if (status === 'FAILED') {
    return (
      <p className="text-xs text-muted mt-3">
        WhatsApp setup didn&apos;t go through. Try again or contact support.
      </p>
    )
  }
  return (
    <p className="text-xs text-muted mt-3">
      Let customers call or message you on WhatsApp — no separate number needed.
    </p>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/agents/WhatsAppStatusCard.tsx
git commit -m "feat: add WhatsAppStatusCard component"
```

---

### Task 12: Update agent detail page

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`

**Context:** This page currently renders an SMS enable toggle. Find where `smsEnabled` is used in the component and replace it with `<WhatsAppStatusCard>`. Read the file first to find the exact location.

- [ ] **Step 1: Read the agent detail page to find the SMS section**

```bash
grep -n "smsEnabled\|SmsToggle\|EnableSms\|sms" apps/web/src/app/dashboard/\(shell\)/voice-agents/\[id\]/page.tsx
```

- [ ] **Step 2: Replace SMS toggle with `<WhatsAppStatusCard>`**

Import the component and replace the SMS section with:

```tsx
import { WhatsAppStatusCard } from '@/components/agents/WhatsAppStatusCard'
import { WhatsAppStatus } from '@voicecraft/db'

// In the JSX where SMS toggle was:
// Cast via String() to safely convert the Prisma enum value to the string literal
// union expected by the component prop (avoids TypeScript object-enum assignability issues)
<WhatsAppStatusCard
  agentId={agent.id}
  whatsappStatus={agent.whatsappStatus as 'NONE' | 'PENDING' | 'APPROVED' | 'FAILED'}
  whatsappEnabled={agent.whatsappEnabled}
  hasPhoneNumber={!!agent.phoneNumber}
  isActive={agent.status === 'ACTIVE'}
/>
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/\(shell\)/voice-agents/\[id\]/page.tsx
git commit -m "feat: replace SMS toggle with WhatsAppStatusCard on agent detail page"
```

---

### Task 13: Update messages and appointments pages

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/messages/page.tsx`
- Modify: `apps/web/src/app/dashboard/(shell)/appointments/page.tsx`

- [ ] **Step 1: Update messages page — replace SMS icon with WhatsApp icon**

Find any SMS icon or "SMS" label in `messages/page.tsx` and replace:

```bash
grep -n "sms\|SMS\|SmsConversation" apps/web/src/app/dashboard/\(shell\)/messages/page.tsx
```

Update Prisma model references (`smsConversation` → `conversation`, `smsMessages` → `messages`), update icon/label to WhatsApp.

- [ ] **Step 2: Update appointments page — show reminderSent checkmark**

Find where appointments are rendered in `appointments/page.tsx` and add:

```tsx
{appt.reminderSent && (
  <span className="text-xs text-success" title="Reminder sent via WhatsApp">✓ Reminded</span>
)}
```

- [ ] **Step 3: Type-check + lint**

```bash
pnpm type-check && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/\(shell\)/messages/page.tsx \
        apps/web/src/app/dashboard/\(shell\)/appointments/page.tsx
git commit -m "feat: update messages and appointments UI for WhatsApp"
```

---

### Task 14: Delete old SMS routes and update env + README

**Files:**
- Delete: `apps/web/src/app/api/agents/[id]/sms/route.ts`
- Delete: `apps/web/src/app/api/webhooks/twilio-sms/route.ts`
- Delete: `apps/web/src/lib/sms-prompt.ts`
- Modify: `apps/web/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Delete old SMS files**

```bash
rm apps/web/src/app/api/agents/\[id\]/sms/route.ts
rm apps/web/src/app/api/webhooks/twilio-sms/route.ts
rm apps/web/src/lib/sms-prompt.ts
```

- [ ] **Step 2: Check for any remaining imports of deleted files**

```bash
grep -r "from.*agents/\[id\]/sms\|twilio-sms\|sms-prompt" apps/web/src/
```

Fix any remaining imports.

- [ ] **Step 2b: Verify `isTwilioConfigured()` no longer checks `TWILIO_FROM_NUMBER`**

This was done in Task 2. Confirm:
```bash
grep "TWILIO_FROM_NUMBER" apps/web/src/lib/twilio.ts
```
Expected: no output. If `TWILIO_FROM_NUMBER` is still present in `isTwilioConfigured()`, fix it now.

**Important:** `apps/web/src/app/api/webhooks/send-sms/route.ts` also calls `isTwilioConfigured()` and `sendSms()`. This route is used by the LiveKit voice agent to send SMS — it is **out of scope for this task** but must not be broken. Since `isTwilioConfigured()` no longer checks `TWILIO_FROM_NUMBER`, the `send-sms` route will now call `sendSms()` which requires `TWILIO_FROM_NUMBER`. Until that route is separately retired (a future task), ensure `TWILIO_FROM_NUMBER` remains in `.env.local` on production to avoid breaking voice-agent SMS. Document this in a code comment in `send-sms/route.ts`:

```typescript
// TODO: This route is a legacy SMS send path used by the voice agent.
// WhatsApp is now the primary messaging channel. This route should be
// updated to use sendWhatsApp() or retired in a future task.
```

- [ ] **Step 3: Update `apps/web/.env.example`**

Remove `TWILIO_FROM_NUMBER`. Add new variables:

```bash
# WhatsApp (via Twilio WAISV)
TWILIO_WA_CONFIRMATION_SID=    # Meta-approved confirmation template SID (HX...)
TWILIO_WA_REMINDER_SID=        # Meta-approved reminder template SID (HX...)
CRON_SECRET=                   # Secret for appointment reminder cron route
```

- [ ] **Step 4: Update `README.md`**

Find the messaging/SMS section in README.md and update:
- Replace "SMS" with "WhatsApp" as the messaging channel
- Update the webhook table: remove `twilio-sms`, add `twilio-whatsapp` and `twilio-whatsapp-status`
- Add `/api/cron/appointment-reminders` to the API routes table
- Add new env vars to the environment variables section

- [ ] **Step 5: Final type-check + lint**

```bash
pnpm type-check && pnpm lint
```

Expected: Clean — no errors or warnings.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove legacy SMS routes, update env.example and README for WhatsApp"
```

---

## Manual Testing Checklist

After all tasks are complete, verify end-to-end:

**Provisioning:**
- [ ] Agent detail page shows WhatsApp card (not SMS toggle)
- [ ] With no phone number: card shows "Deploy your agent..." message, Enable button absent
- [ ] With active agent + phone number: Enable button present
- [ ] Click Enable → status changes to "Setting up..."
- [ ] Simulate approval: POST to `/api/webhooks/twilio-whatsapp-status` with `SenderStatus=approved&PhoneNumber=+1XXX` (use Twilio test credentials or ngrok)

**Inbound message:**
```bash
# Simulate Twilio WhatsApp webhook (replace values):
curl -X POST https://your-ngrok-url/api/webhooks/twilio-whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: <valid_sig>" \
  -d "From=whatsapp:+16505551234&To=whatsapp:+16505559999&Body=What+are+your+hours&MessageSid=SM123"
```

Expected: AI reply sent back, conversation appears in messages dashboard.

**Messages dashboard:**
- [ ] Conversations load and show WhatsApp icon
- [ ] Owner can reply — reply appears in thread and sends via WhatsApp

**Voice call booking confirmation (Task 9):**
```bash
# Simulate a voice agent booking (as the LiveKit agent would call):
curl -X POST http://localhost:3000/api/webhooks/book \
  -H "x-api-key: your_voicecraft_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<active-whatsapp-agent-id>",
    "patientName": "Test Patient",
    "patientPhone": "+1XXXXXXXXXX",
    "scheduledAt": "2026-04-10T14:00:00.000Z",
    "service": "Consultation"
  }'
```
Expected: `{ "appointment": { ... } }` — and a WhatsApp confirmation template message sent to the patient's number. Check Twilio logs to confirm the message was sent.

**Reminder cron:**
```bash
# Test cron manually:
curl -X POST http://localhost:3000/api/cron/appointment-reminders \
  -H "Authorization: Bearer your_cron_secret"
```

Expected: `{ "total": N, "sent": N, "failed": 0 }`

**Opt-out:**
- [ ] POST to `twilio-whatsapp-status` with STOP body → `conversation.optedOut = true`
- [ ] Subsequent inbound message from that customer → silently dropped
