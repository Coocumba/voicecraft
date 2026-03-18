# SMS Bot + Messages Inbox — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to auto-reply to inbound text messages using AI, and provide a Messages inbox for owners to view conversations and reply when the bot can't help.

**Architecture:** Add SMS database models (SmsConversation, SmsMessage), a Twilio inbound SMS webhook that uses Claude for AI responses, an enable/disable toggle on the agent detail page, API routes for conversations and replies, and a split-pane Messages inbox page. Reuse the agent's existing config (services, hours, timezone) for the SMS bot's knowledge.

**Tech Stack:** TypeScript, Next.js 16 App Router, Tailwind CSS, Prisma, Twilio SMS API, Claude (via existing `chatCompletion`), Sonner toasts.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/prisma/schema.prisma` | Modify | Add `smsEnabled` to Agent, `SmsConversation`, `SmsMessage` models + enums |
| `packages/db/src/index.ts` | Modify | Export new enums and types |
| `apps/web/src/lib/twilio.ts` | Modify | Add `from` param to `sendSms`, add `configureNumberSmsWebhook` |
| `apps/web/src/lib/sms-prompt.ts` | Create | Build SMS system prompt from agent config |
| `apps/web/src/lib/sms-response-parser.ts` | Create | Parse LLM JSON response with fallback strategies |
| `apps/web/src/app/api/agents/[id]/sms/route.ts` | Create | POST/DELETE to enable/disable SMS |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | Create | Inbound SMS handler |
| `apps/web/src/app/api/messages/route.ts` | Create | GET conversations, POST owner reply |
| `apps/web/src/app/api/messages/[conversationId]/route.ts` | Create | GET messages for a conversation |
| `apps/web/src/components/agents/SmsToggleCard.tsx` | Create | Enable/disable SMS card on agent detail |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify | Add SmsToggleCard |
| `apps/web/src/components/layout/TopBar.tsx` | Modify | Messages nav with badge |
| `apps/web/src/app/dashboard/(shell)/messages/page.tsx` | Create | Messages inbox server component |
| `apps/web/src/app/dashboard/(shell)/messages/loading.tsx` | Create | Loading skeleton |
| `apps/web/src/components/messages/MessagesClient.tsx` | Create | Split-pane inbox client component |
| `apps/web/src/components/messages/ConversationList.tsx` | Create | Left pane |
| `apps/web/src/components/messages/MessageThread.tsx` | Create | Right pane with reply input |

---

## Chunk 1: Database + Twilio + SMS Prompt

### Task 1: Database schema — SMS models and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Read the current schema**

Read `packages/db/prisma/schema.prisma` to confirm the Agent model structure.

- [ ] **Step 2: Add enums**

Add after the existing `PhoneNumberStatus` enum:

```prisma
enum SmsConversationStatus {
  ACTIVE
  NEEDS_REPLY
  RESOLVED
}

enum SmsDirection {
  INBOUND
  OUTBOUND
}

enum SmsSender {
  CUSTOMER
  BOT
  OWNER
}
```

- [ ] **Step 3: Add SmsConversation model**

```prisma
model SmsConversation {
  id            String                @id @default(cuid())
  agentId       String
  agent         Agent                 @relation(fields: [agentId], references: [id], onDelete: Cascade)
  customerPhone String
  status        SmsConversationStatus @default(ACTIVE)
  lastMessageAt DateTime
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  messages      SmsMessage[]

  @@unique([agentId, customerPhone])
  @@index([agentId, status])
  @@index([agentId, lastMessageAt])
}
```

- [ ] **Step 4: Add SmsMessage model**

```prisma
model SmsMessage {
  id             String          @id @default(cuid())
  conversationId String
  conversation   SmsConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      SmsDirection
  sender         SmsSender
  body           String
  twilioSid      String?
  createdAt      DateTime        @default(now())

  @@index([conversationId, createdAt])
}
```

- [ ] **Step 5: Add fields to Agent model**

Add to the Agent model after `poolNumber`:

```prisma
  smsEnabled       Boolean           @default(false)
  smsConversations SmsConversation[]
```

- [ ] **Step 6: Export new types from packages/db**

In `packages/db/src/index.ts`, add to the exports:

```typescript
export { ..., SmsConversationStatus, SmsDirection, SmsSender } from "@prisma/client"
export type { ..., SmsConversation, SmsMessage } from "@prisma/client"
```

- [ ] **Step 7: Generate Prisma client and create migration**

```bash
cd packages/db
npx prisma migrate dev --name add_sms_models
```

- [ ] **Step 8: Verify**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/db/
git commit -m "feat: add SmsConversation and SmsMessage models with smsEnabled on Agent"
```

---

### Task 2: Twilio — sendSms `from` param + configureNumberSmsWebhook

**Files:**
- Modify: `apps/web/src/lib/twilio.ts`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/lib/twilio.ts` to confirm `sendSms` and `configureNumberVoiceWebhook` signatures.

- [ ] **Step 2: Add optional `from` parameter to `sendSms`**

Change the signature:

```typescript
export async function sendSms(
  to: string,
  body: string,
  from?: string
): Promise<{ success: boolean; sid?: string }>
```

Inside the function, change:
```typescript
// Before:
const from = process.env.TWILIO_FROM_NUMBER
if (!from) throw new Error("TWILIO_FROM_NUMBER env var is required")

// After:
const sender = from ?? process.env.TWILIO_FROM_NUMBER
if (!sender) throw new Error("TWILIO_FROM_NUMBER env var is required (or pass from parameter)")
```

Update the `URLSearchParams` to use `sender` instead of `from` for the `From` field.

- [ ] **Step 3: Add `configureNumberSmsWebhook` function**

Add after `configureNumberVoiceWebhook`:

```typescript
/**
 * Configure or clear the SMS webhook URL on a Twilio phone number.
 * Pass null to clear the webhook (disabling inbound SMS handling).
 */
export async function configureNumberSmsWebhook(
  numberSid: string,
  smsUrl: string | null
): Promise<void> {
  const params = new URLSearchParams({
    SmsUrl: smsUrl ?? "",
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
    throw new Error(`Twilio SMS webhook config failed (${res.status}): ${text}`)
  }
}
```

- [ ] **Step 4: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/twilio.ts
git commit -m "feat: add from param to sendSms and configureNumberSmsWebhook function"
```

---

### Task 3: SMS prompt builder

**Files:**
- Create: `apps/web/src/lib/sms-prompt.ts`

- [ ] **Step 1: Create the SMS prompt builder**

```typescript
import type { AgentConfig } from "@/lib/builder-types"

/**
 * Build a system prompt for the SMS bot from the agent's existing config.
 * The bot handles appointments, hours, and services — hands off everything else.
 */
export function buildSmsSystemPrompt(config: AgentConfig): string {
  const businessName = config.business_name ?? "our business"
  const tone = config.tone ?? "friendly"
  const timezone = config.timezone ?? "UTC"

  // Format services list
  let servicesText = "No specific services listed."
  if (config.services && config.services.length > 0) {
    servicesText = config.services
      .map((s) => {
        const parts = [s.name]
        if (s.duration > 0) parts.push(`${s.duration} min`)
        if (s.price > 0) parts.push(`$${s.price}`)
        return `- ${parts.join(", ")}`
      })
      .join("\n")
  }

  // Format hours
  let hoursText = "Not specified — assume standard business hours."
  if (config.hours) {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    const lines: string[] = []
    for (const day of days) {
      const h = config.hours[day]
      if (h === null || h === undefined) {
        lines.push(`- ${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`)
      } else {
        lines.push(`- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${h.open} – ${h.close}`)
      }
    }
    hoursText = lines.join("\n")
  }

  return `You are a text message assistant for ${businessName}. You respond to customer texts. Keep replies SHORT — 1 to 3 sentences max. This is SMS, not email.

You can help with:
- Checking appointment availability
- Booking appointments
- Business hours and location
- Services offered and pricing
- Cancelling or rescheduling appointments

Services:
${servicesText}

Business hours (timezone: ${timezone}):
${hoursText}

IMPORTANT RULES:
- If asked something outside the topics above (insurance, medical advice, billing disputes, complaints, anything you're unsure about), set handoff to true and reply: "Great question! Let me connect you with our team. Someone will text you back shortly."
- Never make up information that isn't listed above.
- Be ${tone} and professional.
- Use the customer's name if they provide it.
- For appointment booking, confirm: service, date, time, and name before booking.

Respond with JSON only:
{
  "reply": "your message to the customer",
  "handoff": false,
  "action": null
}

Possible actions: "check_availability", "book", "cancel", null
When action is "check_availability", include: "actionData": { "date": "YYYY-MM-DD", "service": "service name" }
When action is "book", include: "actionData": { "date": "YYYY-MM-DD", "time": "HH:MM", "service": "service name", "patientName": "name" }
When action is "cancel", include: "actionData": { "patientName": "name" }
`
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/sms-prompt.ts
git commit -m "feat: add SMS system prompt builder from agent config"
```

---

### Task 4: SMS response parser

**Files:**
- Create: `apps/web/src/lib/sms-response-parser.ts`

- [ ] **Step 1: Create the parser**

```typescript
export interface SmsLlmResponse {
  reply: string
  handoff: boolean
  action: "check_availability" | "book" | "cancel" | null
  actionData?: Record<string, string>
}

const FALLBACK_RESPONSE: SmsLlmResponse = {
  reply: "Thanks for your message! We'll get back to you shortly.",
  handoff: true,
  action: null,
}

/**
 * Parse the LLM response as JSON, trying multiple strategies.
 * Falls back to a handoff response if all parsing fails.
 */
export function parseSmsResponse(raw: string): SmsLlmResponse {
  // Strategy 1: direct JSON.parse
  try {
    const parsed = JSON.parse(raw)
    if (isValidResponse(parsed)) return parsed
  } catch {
    // continue
  }

  // Strategy 2: extract from markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch && fenceMatch[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1])
      if (isValidResponse(parsed)) return parsed
    } catch {
      // continue
    }
  }

  // Strategy 3: find first { to last }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      if (isValidResponse(parsed)) return parsed
    } catch {
      // continue
    }
  }

  // Strategy 4: treat raw text as the reply, hand off to owner
  return FALLBACK_RESPONSE
}

function isValidResponse(obj: unknown): obj is SmsLlmResponse {
  if (typeof obj !== "object" || obj === null) return false
  const r = obj as Record<string, unknown>
  return typeof r.reply === "string" && typeof r.handoff === "boolean"
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/sms-response-parser.ts
git commit -m "feat: add SMS LLM response parser with fallback strategies"
```

---

## Chunk 2: API Routes (Enable/Disable, Webhook, Messages)

### Task 5: Enable/disable SMS API route

**Files:**
- Create: `apps/web/src/app/api/agents/[id]/sms/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { configureNumberSmsWebhook } from "@/lib/twilio"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Enable SMS on this agent's phone number.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, userId: true, phoneNumber: true, phoneNumberSid: true, smsEnabled: true },
  })

  if (!agent || agent.userId !== session.user.id) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  if (!agent.phoneNumber || !agent.phoneNumberSid) {
    return Response.json({ error: "Agent has no phone number" }, { status: 400 })
  }

  if (agent.smsEnabled) {
    return Response.json({ error: "SMS is already enabled" }, { status: 409 })
  }

  // Configure Twilio SMS webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl && !appUrl.includes("localhost")) {
    await configureNumberSmsWebhook(
      agent.phoneNumberSid,
      `${appUrl}/api/webhooks/twilio-sms`
    )
  }

  const updated = await prisma.agent.update({
    where: { id },
    data: { smsEnabled: true },
  })

  return Response.json({ agent: updated })
}

/**
 * DELETE — Disable SMS on this agent's phone number.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, userId: true, phoneNumberSid: true, smsEnabled: true },
  })

  if (!agent || agent.userId !== session.user.id) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  if (!agent.smsEnabled) {
    return Response.json({ error: "SMS is not enabled" }, { status: 409 })
  }

  // Clear Twilio SMS webhook
  if (agent.phoneNumberSid) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes("localhost")) {
      await configureNumberSmsWebhook(agent.phoneNumberSid, null)
    }
  }

  const updated = await prisma.agent.update({
    where: { id },
    data: { smsEnabled: false },
  })

  return Response.json({ agent: updated })
}
```

- [ ] **Step 2: Verify types and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/agents/\[id\]/sms/
git commit -m "feat: add API route to enable/disable SMS on agent"
```

---

### Task 6: Inbound SMS webhook

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio-sms/route.ts`

- [ ] **Step 1: Read the voice webhook for the pattern**

Read `apps/web/src/app/api/webhooks/twilio-voice/route.ts` for the Twilio signature validation and TwiML response pattern.

- [ ] **Step 2: Create the inbound SMS webhook**

```typescript
import { prisma, SmsConversationStatus, SmsDirection, SmsSender } from "@voicecraft/db"
import { validateTwilioSignature, sendSms } from "@/lib/twilio"
import { chatCompletion } from "@/lib/llm"
import { buildSmsSystemPrompt } from "@/lib/sms-prompt"
import { parseSmsResponse } from "@/lib/sms-response-parser"
import { rateLimit } from "@/lib/rate-limit"
import type { AgentConfig } from "@/lib/builder-types"

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'
const TWIML_HEADERS = { "Content-Type": "text/xml" }

export async function POST(request: Request): Promise<Response> {
  // Parse Twilio form data
  const formData = await request.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    params[key] = String(value)
  })

  // Validate Twilio signature
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl ? `${appUrl}/api/webhooks/twilio-sms` : request.url
  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-sms] Invalid Twilio signature")
    return new Response("Forbidden", { status: 403 })
  }

  const customerPhone = params["From"] ?? ""
  const agentPhone = params["To"] ?? ""
  const body = params["Body"] ?? ""
  const messageSid = params["MessageSid"] ?? ""

  if (!customerPhone || !agentPhone) {
    return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
  }

  // Rate limit: 10 messages per 5 minutes per customer phone
  const { success: withinLimit } = rateLimit(customerPhone, {
    limit: 10,
    windowMs: 5 * 60 * 1000,
  })
  if (!withinLimit) {
    return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
  }

  // Look up agent by phone number via PhoneNumber model
  const phoneRecord = await prisma.phoneNumber.findUnique({
    where: { number: agentPhone },
    select: { agentId: true },
  })

  if (!phoneRecord?.agentId) {
    return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
  }

  const agent = await prisma.agent.findUnique({
    where: { id: phoneRecord.agentId },
    select: {
      id: true,
      userId: true,
      phoneNumber: true,
      smsEnabled: true,
      config: true,
    },
  })

  if (!agent || !agent.smsEnabled) {
    return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
  }

  const config = (typeof agent.config === "object" && agent.config !== null
    ? agent.config
    : {}) as AgentConfig

  try {
    // Find or create conversation
    const conversation = await prisma.smsConversation.upsert({
      where: {
        agentId_customerPhone: {
          agentId: agent.id,
          customerPhone,
        },
      },
      create: {
        agentId: agent.id,
        customerPhone,
        status: SmsConversationStatus.ACTIVE,
        lastMessageAt: new Date(),
      },
      update: {
        lastMessageAt: new Date(),
      },
    })

    // Save inbound message
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: SmsDirection.INBOUND,
        sender: SmsSender.CUSTOMER,
        body: body || "(empty message)",
        twilioSid: messageSid || null,
      },
    })

    // Handle MMS with no text body
    if (!body.trim()) {
      const mmsReply = "Thanks for your message! We can only respond to text messages at this time."
      await prisma.smsMessage.create({
        data: {
          conversationId: conversation.id,
          direction: SmsDirection.OUTBOUND,
          sender: SmsSender.BOT,
          body: mmsReply,
        },
      })
      await sendSms(customerPhone, mmsReply, agent.phoneNumber ?? undefined)
      return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
    }

    // Load conversation history (last 10 messages for context)
    const recentMessages = await prisma.smsMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { sender: true, body: true },
    })

    // Build conversation history for LLM (oldest first)
    const history = recentMessages.reverse().map((m) => ({
      role: (m.sender === SmsSender.CUSTOMER ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }))

    // Generate AI response
    const systemPrompt = buildSmsSystemPrompt(config)
    const llmResponse = await chatCompletion({
      system: systemPrompt,
      messages: history,
      maxTokens: 512,
    })

    const parsed = parseSmsResponse(llmResponse.content)

    // Save bot reply
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: SmsDirection.OUTBOUND,
        sender: SmsSender.BOT,
        body: parsed.reply,
      },
    })

    // Send reply via Twilio (from the agent's number)
    try {
      await sendSms(customerPhone, parsed.reply, agent.phoneNumber ?? undefined)
    } catch (err) {
      console.error("[twilio-sms] Failed to send reply", err)
    }

    // Set conversation to NEEDS_REPLY if bot handed off
    if (parsed.handoff) {
      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { status: SmsConversationStatus.NEEDS_REPLY },
      })
    }

    // Handle actions (check_availability, book, cancel)
    if (parsed.action && parsed.actionData) {
      try {
        await handleSmsAction(
          parsed.action,
          parsed.actionData,
          agent,
          conversation.id,
          customerPhone,
          config
        )
      } catch (err) {
        console.error("[twilio-sms] Action handling failed", err)
      }
    }

  } catch (err) {
    console.error("[twilio-sms] Error processing inbound SMS", err)

    // Fallback: try to send a generic reply
    try {
      await sendSms(
        customerPhone,
        "Thanks for your message! We'll get back to you shortly.",
        agent.phoneNumber ?? undefined
      )
    } catch {
      // Give up silently
    }
  }

  return new Response(EMPTY_TWIML, { status: 200, headers: TWIML_HEADERS })
}
```

**Action handler:** Add a `handleSmsAction` helper function in the same file (or extract to `apps/web/src/lib/sms-actions.ts` if it grows large). Implementation:

```typescript
async function handleSmsAction(
  action: string,
  actionData: Record<string, string>,
  agent: { id: string; userId: string; phoneNumber: string | null },
  conversationId: string,
  customerPhone: string,
  config: AgentConfig
) {
  const timezone = config.timezone ?? "UTC"

  if (action === "check_availability" && actionData.date) {
    // Use generateSlots + getCalendarEventsForDate to find open slots
    const { generateSlots } = await import("@/lib/slot-generator")
    const { getCalendarEventsForDate } = await import("@/lib/google-calendar")
    const { getDayName } = await import("@/lib/timezone-utils")

    const dayName = getDayName(actionData.date, timezone)
    const dayHours = config.hours?.[dayName]
    if (dayHours === null) {
      await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
        `We're closed on ${dayName}s. Would another day work?`)
      return
    }
    const open = dayHours?.open ?? "09:00"
    const close = dayHours?.close ?? "17:00"
    const duration = config.services?.find(
      s => s.name.toLowerCase() === (actionData.service ?? "").toLowerCase()
    )?.duration ?? 30

    const allSlots = generateSlots(actionData.date, open, close, duration, timezone)
    let available = allSlots
    try {
      const events = await getCalendarEventsForDate(agent.userId, actionData.date, timezone)
      available = allSlots.filter(slot => {
        const start = new Date(slot).getTime()
        const end = start + duration * 60_000
        return !events.some(ev => ev.start.getTime() < end && ev.end.getTime() > start)
      })
    } catch { /* use all slots if calendar fails */ }

    if (available.length === 0) {
      await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
        "Sorry, no availability on that date. Would you like to try a different day?")
    } else {
      const formatted = available.slice(0, 5).map(s =>
        new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })
      ).join(", ")
      await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
        `Here are the available times: ${formatted}. Which works for you?`)
    }
  }

  if (action === "book" && actionData.date && actionData.time && actionData.patientName) {
    const scheduledAt = new Date(`${actionData.date}T${actionData.time}:00`)
    const service = actionData.service ?? "Appointment"
    await prisma.appointment.create({
      data: {
        agentId: agent.id,
        patientName: actionData.patientName,
        patientPhone: customerPhone,
        scheduledAt,
        service,
        status: "BOOKED",
      },
    })
    // Google Calendar sync (non-fatal)
    try {
      const { bookAppointment } = await import("@/lib/google-calendar")
      const result = await bookAppointment(agent.userId, {
        patientName: actionData.patientName,
        patientPhone: customerPhone,
        scheduledAt: scheduledAt.toISOString(),
        service,
      })
      await prisma.appointment.updateMany({
        where: { agentId: agent.id, patientPhone: customerPhone, scheduledAt },
        data: { calendarEventId: result.eventId },
      })
    } catch { /* non-fatal */ }
    await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
      `You're booked! ${service} on ${actionData.date} at ${actionData.time}. See you then!`)
  }

  if (action === "cancel") {
    const upcoming = await prisma.appointment.findFirst({
      where: {
        agentId: agent.id,
        patientPhone: customerPhone,
        status: "BOOKED",
        scheduledAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
    })
    if (!upcoming) {
      await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
        "I couldn't find an upcoming appointment for this number.")
      return
    }
    await prisma.appointment.update({
      where: { id: upcoming.id },
      data: { status: "CANCELLED" },
    })
    if (upcoming.calendarEventId) {
      try {
        const { deleteCalendarEvent } = await import("@/lib/google-calendar")
        await deleteCalendarEvent(agent.userId, upcoming.calendarEventId)
      } catch { /* non-fatal */ }
    }
    await sendFollowUp(conversationId, customerPhone, agent.phoneNumber,
      `Your ${upcoming.service} appointment has been cancelled.`)
  }
}

async function sendFollowUp(
  conversationId: string,
  to: string,
  from: string | null,
  body: string
) {
  await prisma.smsMessage.create({
    data: {
      conversationId,
      direction: SmsDirection.OUTBOUND,
      sender: SmsSender.BOT,
      body,
    },
  })
  await sendSms(to, body, from ?? undefined)
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio-sms/
git commit -m "feat: add inbound SMS webhook with AI auto-reply and handoff"
```

---

### Task 7: Messages API routes

**Files:**
- Create: `apps/web/src/app/api/messages/route.ts`
- Create: `apps/web/src/app/api/messages/[conversationId]/route.ts`

- [ ] **Step 1: Create GET conversations + POST reply route**

`apps/web/src/app/api/messages/route.ts`:

```typescript
import { auth } from "@/auth"
import { prisma, SmsConversationStatus, SmsDirection, SmsSender } from "@voicecraft/db"
import { sendSms } from "@/lib/twilio"

/**
 * GET — List SMS conversations for the authenticated user's agents.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get("agentId")

  const agentWhere = agentId
    ? { id: agentId, userId: session.user.id, smsEnabled: true }
    : { userId: session.user.id, smsEnabled: true }

  const conversations = await prisma.smsConversation.findMany({
    where: { agent: agentWhere },
    orderBy: { lastMessageAt: "desc" },
    include: {
      agent: { select: { id: true, name: true, phoneNumber: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, sender: true },
      },
    },
  })

  return Response.json({ conversations })
}

/**
 * POST — Send a manual reply from the owner.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { conversationId, body: messageBody } = body as Record<string, unknown>

  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return Response.json({ error: "conversationId is required" }, { status: 400 })
  }
  if (typeof messageBody !== "string" || !messageBody.trim()) {
    return Response.json({ error: "body is required" }, { status: 400 })
  }

  // Verify ownership
  const conversation = await prisma.smsConversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: { select: { userId: true, phoneNumber: true } },
    },
  })

  if (!conversation || conversation.agent.userId !== session.user.id) {
    return Response.json({ error: "Conversation not found" }, { status: 404 })
  }

  // Send SMS from the agent's number
  const fromNumber = conversation.agent.phoneNumber
  if (!fromNumber) {
    return Response.json({ error: "Agent has no phone number" }, { status: 400 })
  }

  try {
    const result = await sendSms(conversation.customerPhone, messageBody.trim(), fromNumber)

    // Save message
    const message = await prisma.smsMessage.create({
      data: {
        conversationId,
        direction: SmsDirection.OUTBOUND,
        sender: SmsSender.OWNER,
        body: messageBody.trim(),
        twilioSid: result.sid ?? null,
      },
    })

    // Update conversation status and timestamp
    await prisma.smsConversation.update({
      where: { id: conversationId },
      data: {
        status: SmsConversationStatus.ACTIVE,
        lastMessageAt: new Date(),
      },
    })

    return Response.json({ message }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/messages] Failed to send reply", err)
    const msg = err instanceof Error ? err.message : "Failed to send message"
    return Response.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create GET messages for conversation route**

`apps/web/src/app/api/messages/[conversationId]/route.ts`:

```typescript
import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

interface RouteContext {
  params: Promise<{ conversationId: string }>
}

/**
 * GET — Get messages for a specific conversation.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { conversationId } = await params

  const conversation = await prisma.smsConversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: { select: { userId: true, name: true } },
    },
  })

  if (!conversation || conversation.agent.userId !== session.user.id) {
    return Response.json({ error: "Conversation not found" }, { status: 404 })
  }

  const messages = await prisma.smsMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      direction: true,
      sender: true,
      body: true,
      createdAt: true,
    },
  })

  return Response.json({
    conversation: {
      id: conversation.id,
      customerPhone: conversation.customerPhone,
      status: conversation.status,
      agentName: conversation.agent.name,
    },
    messages,
  })
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/messages/
git commit -m "feat: add messages API routes for conversations and owner replies"
```

---

## Chunk 3: UI Components (Toggle Card, Nav Badge, Messages Inbox)

### Task 8: SmsToggleCard component

**Files:**
- Create: `apps/web/src/components/agents/SmsToggleCard.tsx`

- [ ] **Step 1: Create the component**

A `'use client'` component with enable/disable functionality:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface SmsToggleCardProps {
  agentId: string
  smsEnabled: boolean
  hasPhoneNumber: boolean
  canBookAppointments: boolean
}

export function SmsToggleCard({
  agentId,
  smsEnabled: initialEnabled,
  hasPhoneNumber,
  canBookAppointments,
}: SmsToggleCardProps) {
  const router = useRouter()
  const [smsEnabled, setSmsEnabled] = useState(initialEnabled)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  if (!hasPhoneNumber || !canBookAppointments) return null

  async function handleEnable() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/sms`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to enable text messages')
      }
      setSmsEnabled(true)
      toast.success('Text messages enabled!')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDisable() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/sms`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to disable text messages')
      }
      setSmsEnabled(false)
      setConfirmDisable(false)
      toast.success('Text messages turned off')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  // Enabled state
  if (smsEnabled) {
    return (
      <div className="bg-success/5 border border-success/20 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-success" />
            <span className="text-sm font-medium text-ink">Text messages are on</span>
          </div>
          {confirmDisable ? (
            <span className="flex items-center gap-2 text-sm">
              <button
                onClick={() => void handleDisable()}
                disabled={isLoading}
                className="text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Turning off...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDisable(false)}
                className="text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDisable(true)}
              className="text-xs text-muted hover:text-ink underline underline-offset-2 transition-colors"
            >
              Turn off
            </button>
          )}
        </div>
        <p className="text-xs text-success mt-1 ml-4">
          Customers can text this number. Replies the bot can&apos;t handle appear in{' '}
          <Link href="/dashboard/messages" className="underline underline-offset-2 hover:text-success/80">
            Messages
          </Link>.
        </p>
      </div>
    )
  }

  // Not enabled state
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink mb-1">Handle text messages too?</p>
          <p className="text-xs text-muted leading-relaxed mb-1">
            Customers can text this number and get instant replies about your hours,
            services, and appointments. You&apos;ll see conversations in your dashboard.
          </p>
          <p className="text-xs text-muted mb-3">Each text costs about 1 cent.</p>
          <button
            onClick={() => void handleEnable()}
            disabled={isLoading}
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Enabling...' : 'Enable text messages'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/agents/SmsToggleCard.tsx
git commit -m "feat: add SmsToggleCard for enabling/disabling text messages on agent"
```

---

### Task 9: Add SmsToggleCard to agent detail page

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`

- [ ] **Step 1: Read the current file**

Read the agent detail page to find the exact insertion point (after CallForwardingGuide, before CollapsibleConfig).

- [ ] **Step 2: Add import**

```typescript
import { SmsToggleCard } from '@/components/agents/SmsToggleCard'
```

- [ ] **Step 3: Add SmsToggleCard after the CallForwardingGuide**

Inside the `<div className="mb-8 space-y-4">` block that contains PhoneNumberCard and CallForwardingGuide, add:

```tsx
{agent.phoneNumber && config?.can_book_appointments && (
  <SmsToggleCard
    agentId={agent.id}
    smsEnabled={agent.smsEnabled ?? false}
    hasPhoneNumber={!!agent.phoneNumber}
    canBookAppointments={config.can_book_appointments === true}
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx"
git commit -m "feat: add SMS toggle card to agent detail page"
```

---

### Task 10: Update TopBar with Messages nav and badge

**Files:**
- Modify: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/layout/TopBar.tsx` to see the nav items array and component structure.

- [ ] **Step 2: Change the SMS Bot placeholder**

Replace:
```typescript
{ label: 'SMS Bot', href: '#', available: false },
```
With:
```typescript
{ label: 'Messages', href: '/dashboard/messages', available: true },
```

**Badge count:** The TopBar is currently a client component. To show the NEEDS_REPLY count without making it a server component (which would be a larger refactor), add a `useEffect` that fetches the count on mount:

```typescript
const [unreadCount, setUnreadCount] = useState(0)

useEffect(() => {
  fetch('/api/messages?countOnly=true')
    .then(res => res.json())
    .then(data => setUnreadCount(data.needsReplyCount ?? 0))
    .catch(() => {})
}, [])
```

Add a `countOnly` query param handler to the GET `/api/messages` route (Task 7) that returns just `{ needsReplyCount: number }` without loading full conversations. Render the badge next to "Messages" when count > 0:

```tsx
{unreadCount > 0 && (
  <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
    {unreadCount}
  </span>
)}
```

**Conditional visibility:** Only show the "Messages" nav item when the user has at least one agent with `smsEnabled: true`. Use the same fetch — if `needsReplyCount` returns or the endpoint doesn't 404, show the item. Or always show it (simpler — the Messages page handles the empty state).

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/TopBar.tsx
git commit -m "feat: replace SMS Bot placeholder with Messages nav item"
```

---

### Task 11: Messages inbox page and components

**Files:**
- Create: `apps/web/src/app/dashboard/(shell)/messages/page.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/messages/loading.tsx`
- Create: `apps/web/src/components/messages/MessagesClient.tsx`
- Create: `apps/web/src/components/messages/ConversationList.tsx`
- Create: `apps/web/src/components/messages/MessageThread.tsx`

- [ ] **Step 1: Create loading skeleton**

`apps/web/src/app/dashboard/(shell)/messages/loading.tsx`:

```typescript
export default function MessagesLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-8 w-40 bg-border/50 rounded-lg mb-6" />
      <div className="bg-white rounded-xl border border-border h-[600px]" />
    </div>
  )
}
```

- [ ] **Step 2: Create the server page component**

`apps/web/src/app/dashboard/(shell)/messages/page.tsx`:

Server component that fetches conversations and SMS-enabled agents, passes to `MessagesClient`.

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, SmsConversationStatus } from '@voicecraft/db'
import { MessagesClient } from '@/components/messages/MessagesClient'

export const metadata = { title: 'Messages — VoiceCraft' }

export default async function MessagesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [smsAgents, conversations] = await Promise.all([
    prisma.agent.findMany({
      where: { userId, smsEnabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.smsConversation.findMany({
      where: { agent: { userId, smsEnabled: true } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, sender: true },
        },
      },
    }),
  ])

  // Sort: NEEDS_REPLY first, then by lastMessageAt
  const sorted = conversations.sort((a, b) => {
    if (a.status === SmsConversationStatus.NEEDS_REPLY && b.status !== SmsConversationStatus.NEEDS_REPLY) return -1
    if (b.status === SmsConversationStatus.NEEDS_REPLY && a.status !== SmsConversationStatus.NEEDS_REPLY) return 1
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  })

  const serialized = sorted.map((c) => ({
    id: c.id,
    customerPhone: c.customerPhone,
    status: c.status as string,
    lastMessageAt: c.lastMessageAt.toISOString(),
    agentName: c.agent.name,
    agentId: c.agent.id,
    lastMessage: c.messages[0]
      ? {
          body: c.messages[0].body,
          createdAt: c.messages[0].createdAt.toISOString(),
          sender: c.messages[0].sender as string,
        }
      : null,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-6">Messages</h1>

      {smsAgents.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted">
            Enable text messages on one of your agents to start receiving customer texts.
          </p>
        </div>
      ) : (
        <MessagesClient
          conversations={serialized}
          agents={smsAgents}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create MessagesClient**

`apps/web/src/components/messages/MessagesClient.tsx`:

Split-pane `'use client'` component. State: `selectedId`, `messages` (fetched on select), `isSending`, `agentFilter`. On conversation select: `fetch(\`/api/messages/${id}\`)`. On reply: `POST /api/messages` then refresh.

Layout: `flex h-[600px]`. Left pane (`w-80 md:border-r`, hidden on mobile when conversation selected). Right pane (`flex-1`, hidden on mobile when no conversation). Mobile uses `cn()` to toggle visibility based on `selectedId`.

Empty states:
- No conversations: "No messages yet. When customers text your number, conversations will appear here."
- No conversation selected (desktop right pane): "Select a conversation to view messages"

- [ ] **Step 4: Create ConversationList**

`apps/web/src/components/messages/ConversationList.tsx`:

Props: `conversations: ConversationSummary[]`, `selectedId: string | null`, `onSelect: (id: string) => void`

Each item: button with `onClick={onSelect(id)}`, highlighted when selected (`bg-accent/5`). Shows:
- Formatted phone number (use `formatPhone` from `@/lib/format-utils`)
- Last message body preview (truncated ~50 chars)
- Relative time ("2m ago", "1h ago", "Yesterday") — add a `formatRelativeTime` helper
- Red "Needs reply" badge when `status === "NEEDS_REPLY"`
- Agent name in small text if multiple agents

- [ ] **Step 5: Create MessageThread**

`apps/web/src/components/messages/MessageThread.tsx`:

Props: `messages`, `customerPhone`, `onSendReply: (body: string) => Promise<void>`, `isSending`, `onBack?: () => void` (mobile back button)

Bubbles: customer messages left (`bg-border/30`), bot messages right (`bg-accent/10`), owner messages right (`bg-accent text-white`). Each has a sender label ("Customer", "Bot", "You") and timestamp above the bubble.

Reply input at the bottom: `<form>` with text input + Send button. Disabled while `isSending`.

- [ ] **Step 6: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS. `/dashboard/messages` should appear in build output.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/messages/" apps/web/src/components/messages/
git commit -m "feat: add Messages inbox page with split-pane conversation view"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full type-check and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS. Verify these routes in build output:
- `/api/agents/[id]/sms`
- `/api/webhooks/twilio-sms`
- `/api/messages`
- `/api/messages/[conversationId]`
- `/dashboard/messages`

- [ ] **Step 2: Verify database migration**

Run: `make db-generate`
Expected: Prisma client regenerated with new models.

- [ ] **Step 3: Commit any remaining changes**
