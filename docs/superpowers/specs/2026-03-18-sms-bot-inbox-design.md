# Inbound SMS Bot + Messages Inbox — Design Spec

**Date:** 2026-03-18
**Status:** Approved for planning
**Scope:** Enable agents to handle inbound text messages with AI-powered auto-replies, and provide a Messages inbox for owners to view conversations and reply manually when the bot can't help. This is SMS Spec 1 of 3.

---

## Problem Statement

VoiceCraft agents have provisioned phone numbers that can receive text messages, but there's no inbound SMS handling. Customers who text the number get no response. Meanwhile, competitors like TrueLark, Podium, and Arini offer 24/7 text-based booking and FAQ responses.

---

## Scope

### In scope

- Opt-in SMS toggle on agent detail page ("Handle text messages too?")
- Inbound SMS webhook to receive and respond to texts
- AI-powered auto-replies using the agent's existing config (services, hours, timezone)
- Graceful handoff to owner when bot can't answer
- SMS conversation and message database models
- Messages inbox page with split-pane layout (conversation list + thread view)
- Owner manual reply from the inbox
- Twilio number configuration for SMS webhook
- Unread badge on "Messages" nav item
- `sms_enabled` field on Agent model

### Out of scope (future specs)

- **Email notifications** when conversations need reply (SMS Spec 2)
- **Browser/mobile push notifications** (SMS Spec 2)
- **Outbound automated messages** — appointment reminders, follow-ups (SMS Spec 2)
- **Marketing campaigns** — bulk sends, opt-in/opt-out compliance (SMS Spec 3)
- **SMS in the builder chat flow** — configuring SMS-specific personality during agent creation

---

## 1. Enabling Text Messages — Owner Experience

### 1.1 Where and when

On the agent detail page, below the phone number card. Only shown when:
- Agent has a provisioned phone number
- Agent has `can_book_appointments: true` in config

If the agent has no number or doesn't book appointments, the card is not shown.

### 1.2 Before enabling

A card appears below the phone number:

```
Handle text messages too?

Customers can text this number and get instant replies about your
hours, services, and appointments. You'll see conversations in your
dashboard.

Each text costs about 1 cent.

[Enable text messages]
```

### 1.3 After enabling

The card changes to a green success state:

```
● Text messages are on                              Turn off

  Customers can text this number. Replies the bot
  can't handle appear in Messages.
```

"Messages" link navigates to `/dashboard/messages`. "Turn off" disables SMS (removes the Twilio SMS webhook, sets `sms_enabled: false`).

### 1.4 Data model change

Add `smsEnabled` boolean field to the `Agent` model in Prisma:

```prisma
model Agent {
  // ... existing fields ...
  smsEnabled  Boolean  @default(false)
}
```

No changes to `AgentConfig` (JSON) — SMS uses the existing config fields.

### 1.5 Enable/disable API

**`POST /api/agents/[id]/sms`** — Enable SMS

- Session authenticated, ownership verified
- Sets `agent.smsEnabled = true`
- Calls Twilio to set `SmsUrl` on the agent's phone number (pointing to `/api/webhooks/twilio-sms`)
- Returns 200

**`DELETE /api/agents/[id]/sms`** — Disable SMS

- Session authenticated, ownership verified
- Sets `agent.smsEnabled = false`
- Calls Twilio to clear `SmsUrl` on the agent's phone number
- Returns 200

### 1.6 Twilio number configuration

Add a new function `configureNumberSmsWebhook(numberSid, smsUrl)` in `apps/web/src/lib/twilio.ts`:

```typescript
export async function configureNumberSmsWebhook(
  numberSid: string,
  smsUrl: string | null  // null = clear the webhook
): Promise<void>
```

Uses `POST /IncomingPhoneNumbers/{sid}.json` with `SmsUrl` and `SmsMethod: POST` params. When `smsUrl` is `null`, sets `SmsUrl` to empty string to disable.

This is NOT called during number provisioning — only when the owner explicitly enables SMS.

**Sending SMS from the agent's number:** The existing `sendSms()` function in `twilio.ts` hardcodes `TWILIO_FROM_NUMBER` as the sender. For the SMS bot, replies must come from the agent's provisioned number (so the customer sees a reply from the same number they texted). Add an optional `from` parameter to `sendSms()`:

```typescript
export async function sendSms(
  to: string,
  body: string,
  from?: string  // Override sender — uses agent's number for SMS bot replies
): Promise<{ success: boolean; sid?: string }>
```

When `from` is provided, use it instead of `TWILIO_FROM_NUMBER`. The inbound webhook and owner reply both pass the agent's `phoneNumber` as `from`.

### 1.7 Language principles

The UI never uses: "SMS bot", "Twilio", "webhook", "inbound/outbound", "per-message billing", "configuration".

The UI uses: "text messages", "texts", "conversations", "replies", "Messages", "turn on/off".

---

## 2. Database Models

### 2.1 SmsConversation

```prisma
model SmsConversation {
  id             String              @id @default(cuid())
  agentId        String
  agent          Agent               @relation(fields: [agentId], references: [id], onDelete: Cascade)
  customerPhone  String              // E.164 — the customer's phone number
  status         SmsConversationStatus @default(ACTIVE)
  lastMessageAt  DateTime
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  messages       SmsMessage[]

  @@unique([agentId, customerPhone])
  @@index([agentId, status])
  @@index([agentId, lastMessageAt])
}

enum SmsConversationStatus {
  ACTIVE       // Bot is handling, no owner action needed
  NEEDS_REPLY  // Bot handed off, owner should respond
  RESOLVED     // Owner marked as resolved (or auto-resolved after owner reply)
}
```

### 2.2 SmsMessage

```prisma
model SmsMessage {
  id              String         @id @default(cuid())
  conversationId  String
  conversation    SmsConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction       SmsDirection
  sender          SmsSender
  body            String
  twilioSid       String?        // Twilio message SID for tracking
  createdAt       DateTime       @default(now())

  @@index([conversationId, createdAt])
}

enum SmsDirection {
  INBOUND   // Customer → agent
  OUTBOUND  // Agent/owner → customer
}

enum SmsSender {
  CUSTOMER
  BOT
  OWNER
}
```

### 2.3 Agent relation

Add to `Agent` model:

```prisma
model Agent {
  // ... existing fields ...
  smsEnabled       Boolean           @default(false)
  smsConversations SmsConversation[]
}
```

---

## 3. Inbound SMS Webhook

### 3.1 Route

**New file:** `apps/web/src/app/api/webhooks/twilio-sms/route.ts`

**POST** — Twilio sends inbound SMS here.

### 3.2 Authentication

Validate the Twilio request signature using the existing `validateTwilioSignature` function from `@/lib/twilio`. This is the same pattern used by the voice webhook.

### 3.3 Flow

```
1. Parse Twilio POST params: From, To, Body, MessageSid
2. Look up agent by phone number: query `PhoneNumber` model where `number === To` (the `PhoneNumber.number` field has a unique index and reliably maps to `agentId`). Then fetch the agent via the `agentId` foreign key.
3. Verify agent.smsEnabled === true (reject with empty TwiML if not)
4. Find or create SmsConversation for this agent + From number
5. Save inbound SmsMessage (direction: INBOUND, sender: CUSTOMER)
6. Load agent config (services, hours, timezone)
7. Load last 10 messages from this conversation (for context)
8. Build SMS system prompt from agent config (see Section 4)
9. Call chatCompletion (Claude) with system prompt + message history
10. Parse response: { reply: string, handoff: boolean }
11. Save bot's reply as outbound SmsMessage (sender: BOT)
12. Send reply via Twilio sendSms()
13. If handoff === true: set conversation status to NEEDS_REPLY
14. Update conversation.lastMessageAt
15. Return empty TwiML: <Response/>
```

### 3.4 Error handling

- If agent not found or SMS not enabled: return empty `<Response/>` (no reply to customer)
- If Claude API fails: send a fallback reply: "Thanks for your message! We'll get back to you shortly." and set status to NEEDS_REPLY
- If Twilio send fails: log error, save the bot message anyway (owner can see it in inbox)

### 3.5 Rate limiting

Limit to 10 inbound messages per customer phone number per 5 minutes to prevent abuse. Return empty `<Response/>` if exceeded.

**Storage:** Use the existing in-memory `rateLimit` function from `@/lib/rate-limit` (same pattern used by the builder message endpoint). In-memory is acceptable here — a restart resets limits, which is a safe failure mode (allows messages through, doesn't block). Redis can be added later if needed.

---

## 4. SMS System Prompt

### 4.1 Prompt construction

Built from the agent's existing config — no new SMS-specific configuration needed.

```
You are a text message assistant for {business_name}. You respond to
customer texts. Keep replies SHORT — 1 to 3 sentences max. This is SMS,
not email.

You can help with:
- Checking appointment availability
- Booking appointments
- Business hours and location
- Services offered: {services list with prices and durations}
- Cancelling or rescheduling appointments

Business hours:
{formatted hours from config}

Timezone: {timezone}

IMPORTANT RULES:
- If asked something outside the topics above (insurance, medical advice,
  billing disputes, complaints, anything you're unsure about), set
  handoff to true and reply: "Great question! Let me connect you with
  our team. Someone will text you back shortly."
- Never make up information that isn't listed above.
- Be warm and professional. Match the business tone: {tone from config}.
- Use the customer's name if they provide it.
- For appointment booking, confirm: service, date, time, and name before
  booking.

Respond with JSON only:
{
  "reply": "your message to the customer",
  "handoff": false,
  "action": null
}

Possible actions: "check_availability", "book", "cancel", null
When action is "check_availability" or "book" or "cancel", also include:
  "actionData": { relevant fields like date, service, patientName, etc. }
```

### 4.2 Action handling

When the LLM returns an action, the webhook processes it via direct function calls (not HTTP requests to webhook routes):

- **`check_availability`**: Call the availability logic directly (import `generateSlots` from `@/lib/slot-generator` and `getCalendarEventsForDate` from `@/lib/google-calendar`). Pass the agent's timezone, hours, and requested date. Send a follow-up SMS with available slots formatted as a short list.

- **`book`**: Create an `Appointment` record via Prisma (same fields as the booking webhook: agentId, patientName, patientPhone, scheduledAt, service, status: BOOKED). Sync to Google Calendar if connected (non-fatal). Send confirmation SMS.

- **`cancel`**: Query `prisma.appointment.findFirst` where `patientPhone` matches, `agentId` matches, `status: BOOKED`, `scheduledAt > now`, ordered by `scheduledAt: asc`. If found: update status to CANCELLED, delete Google Calendar event if `calendarEventId` exists. If not found: reply "I couldn't find an upcoming appointment for this number." If multiple exist: list them and ask which one to cancel. Send confirmation SMS.

Actions are processed after the initial reply is sent. Each action result produces a follow-up outbound `SmsMessage` saved to the conversation.

### 4.3 JSON response parsing

The LLM may return JSON wrapped in markdown fences or with extra text. Use a parsing strategy:

1. Try `JSON.parse(response)` directly
2. If that fails, extract JSON from markdown fences: match `` ```json\n{...}\n``` `` or `` ```\n{...}\n``` ``
3. If that fails, look for the first `{` and last `}` in the response and try parsing that substring
4. If all fail: treat the entire response as the `reply` text with `handoff: true` (fallback to owner)

### 4.4 Conversation context

Pass the last 10 messages as conversation history to Claude so it understands the context. Format as:

```
Customer: Do you have availability Friday?
Assistant: I have openings at 2 PM and 3:30 PM. Would you like to book?
Customer: 2 PM please
```

---

## 5. Messages Inbox Page

### 5.1 Route

**New page:** `apps/web/src/app/dashboard/(shell)/messages/page.tsx`

### 5.2 Nav item

**Modify:** `apps/web/src/components/layout/TopBar.tsx`

Change the "SMS Bot" placeholder from `{ label: 'SMS Bot', href: '#', available: false }` to `{ label: 'Messages', href: '/dashboard/messages', available: true }`.

**Badge count:** The nav item shows a count of conversations with `status: NEEDS_REPLY` for the user's agents. The count is fetched server-side in the layout or TopBar.

Show the badge only when the user has at least one agent with `smsEnabled: true`. If no agents have SMS enabled, the nav item is hidden entirely (same as the current "Coming soon" behavior but cleaner).

### 5.3 Layout — split pane

**Server component** fetches:
- Conversations for user's agents, ordered by `lastMessageAt` desc
- Count of NEEDS_REPLY conversations (for badge)
- User's agents (for filter dropdown)

**Client component:** `MessagesClient`

**Desktop (≥768px):**
```
┌──────────────────────────────────────────────────┐
│ Messages                          [Agent filter ▾]│
├──────────────┬───────────────────────────────────┤
│ Conversations│ Sarah Johnson         +1 (415)... │
│              │                                   │
│ ● Sarah J.   │ ┌─────────────┐                   │
│   Do you acc │ │ Do you accept│                   │
│              │ │ Delta Dental?│                   │
│ ✓ Mike C.    │ └─────────────┘                   │
│   Booked...  │         ┌──────────────────────┐  │
│              │         │ Great question! Let   │  │
│ ✓ Lisa P.    │         │ me connect you with   │  │
│   Hours?     │         │ our team.             │  │
│              │         └──────────────────────┘  │
│              │                                   │
│              │ ┌─────────────────────────────────┐│
│              │ │ Type a reply...            Send ││
│              │ └─────────────────────────────────┘│
└──────────────┴───────────────────────────────────┘
```

**Mobile (<768px):**
- Default: conversation list (full width)
- Tap conversation → thread view (full width) with back button
- Use `useRouter` for navigation between views, or client-side state toggle

### 5.4 Conversation list item

Each item shows:
- **Customer identifier**: Contact name (if phone exists in Contacts table) or formatted phone number
- **Last message preview**: truncated to ~50 chars
- **Time**: relative ("2m ago", "1h ago", "Yesterday")
- **Status indicator**:
  - Red dot + "Needs reply" for `NEEDS_REPLY`
  - Green check for `ACTIVE` (bot handling)
  - Muted check for `RESOLVED`

Items with `NEEDS_REPLY` sort to the top, then by `lastMessageAt` desc.

### 5.5 Thread view

- Message bubbles: customer messages left-aligned (gray), bot messages right-aligned (accent/purple), owner messages right-aligned (darker shade or different label)
- Each message shows sender label: "Customer", "Bot", or "You"
- Timestamp on each message (time only for today, date+time for older)
- Text input at bottom with Send button
- If conversation is `NEEDS_REPLY`: input has focus, placeholder "Type a reply..."
- If conversation is `ACTIVE`: input still available (owner can jump in anytime)

### 5.6 Owner reply

When the owner types and sends a reply:

1. POST `/api/messages` with `{ conversationId, body }`
2. Backend validates ownership (conversation's agent belongs to user)
3. Sends SMS via `sendSms(customerPhone, body)`
4. Saves as `SmsMessage` with `direction: OUTBOUND, sender: OWNER`
5. Sets conversation status to `ACTIVE` (owner replied, no longer needs attention)
6. Updates `lastMessageAt`
7. Client refreshes the thread

### 5.7 Empty states

- **No SMS enabled anywhere**: "Enable text messages on one of your agents to start receiving customer texts." with link to voice agents page
- **SMS enabled but no conversations yet**: "No messages yet. When customers text your number, conversations will appear here."
- **No conversation selected (desktop)**: Right pane shows "Select a conversation to view messages"

---

## 6. Agent Detail Page Changes

### 6.1 SMS enable card

**New client component:** `apps/web/src/components/agents/SmsToggleCard.tsx`

Props: `agentId`, `smsEnabled`, `hasPhoneNumber`, `canBookAppointments`

- Only rendered when `hasPhoneNumber && canBookAppointments`
- Shows enable card (Section 1.2) or enabled state (Section 1.3)
- Enable: POST `/api/agents/[id]/sms`
- Disable: DELETE `/api/agents/[id]/sms` with confirmation ("Turn off text messages?")

### 6.2 Placement

On the agent detail page, after the phone number card and call forwarding guide, before the collapsible config section.

---

## 7. API Routes Summary

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents/[id]/sms` | POST | Enable SMS on agent |
| `/api/agents/[id]/sms` | DELETE | Disable SMS on agent |
| `/api/webhooks/twilio-sms` | POST | Receive inbound SMS from Twilio |
| `/api/messages` | GET | List conversations for user's agents |
| `/api/messages` | POST | Send a manual reply from the inbox |
| `/api/messages/[conversationId]` | GET | Get messages for a conversation |

---

## 8. File Summary

| File | Action |
|------|--------|
| `packages/db/prisma/schema.prisma` | Modify — add `smsEnabled`, `SmsConversation`, `SmsMessage` models |
| `apps/web/src/lib/twilio.ts` | Modify — add `configureNumberSmsWebhook()` |
| `apps/web/src/app/api/agents/[id]/sms/route.ts` | **New** — enable/disable SMS |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | **New** — inbound SMS handler |
| `apps/web/src/lib/sms-prompt.ts` | **New** — build SMS system prompt from agent config |
| `apps/web/src/app/api/messages/route.ts` | **New** — list conversations, send reply |
| `apps/web/src/app/api/messages/[conversationId]/route.ts` | **New** — get messages for conversation |
| `apps/web/src/app/dashboard/(shell)/messages/page.tsx` | **New** — Messages inbox page |
| `apps/web/src/app/dashboard/(shell)/messages/loading.tsx` | **New** — loading skeleton |
| `apps/web/src/components/messages/MessagesClient.tsx` | **New** — split-pane inbox client component |
| `apps/web/src/components/messages/ConversationList.tsx` | **New** — left pane conversation list |
| `apps/web/src/components/messages/MessageThread.tsx` | **New** — right pane message thread |
| `apps/web/src/components/agents/SmsToggleCard.tsx` | **New** — enable/disable SMS card |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify — add SmsToggleCard |
| `apps/web/src/components/layout/TopBar.tsx` | Modify — dynamic Messages nav with badge |

---

## 9. Edge Cases

| Case | Behavior |
|------|----------|
| Customer texts a number with SMS disabled | Empty TwiML response — no reply sent |
| Customer texts a number not in our system | Empty TwiML response |
| Bot can't parse the LLM response | Send fallback "Thanks for your message! We'll get back to you shortly." + set NEEDS_REPLY |
| Owner replies to a conversation | Status changes from NEEDS_REPLY to ACTIVE |
| Same customer texts two different agent numbers | Two separate conversations (keyed by agent + phone) |
| Agent's phone number is released | Existing conversations remain in DB (historical). New texts to that number go unanswered. |
| Owner disables SMS | Twilio webhook cleared. Incoming texts get no response. Existing conversations remain visible in inbox. |
| Very long text message (>160 chars from customer) | Twilio delivers it as one message. No special handling needed. |
| Customer sends MMS (image/video) | Ignore media, respond to text body only. If body is empty, send "Thanks for your message! We can only respond to text messages at this time." |
| Rate limit exceeded (>10 msgs / 5 min) | Empty TwiML, no response. Protects against abuse. |
| Agent has no services in config | Bot can still answer hours questions and do handoffs, just can't book |

---

## 10. Testing Approach

| Test | What to verify |
|------|----------------|
| Enable SMS | Sets `smsEnabled: true`, configures Twilio SmsUrl |
| Disable SMS | Sets `smsEnabled: false`, clears Twilio SmsUrl |
| Inbound SMS — bot handles | Saves message, generates reply, sends via Twilio |
| Inbound SMS — handoff | Reply sent + conversation set to NEEDS_REPLY |
| Inbound SMS — disabled agent | Empty TwiML, no messages saved |
| Owner reply from inbox | Sends SMS, saves message, sets status ACTIVE |
| Conversation threading | Same customer + agent reuses existing conversation |
| Messages page — unread badge | Shows count of NEEDS_REPLY conversations |
| Messages page — no SMS agents | Shows empty state with link to agents |
| Rate limiting | 11th message in 5 min gets empty response |
| LLM failure | Fallback message sent, conversation set to NEEDS_REPLY |
