# Calendar, Appointments & Contacts — Design Spec

## Problem

VoiceCraft's backend handles appointment booking and Google Calendar sync, but the customer-facing dashboard has no way to:
- Connect Google Calendar (button says "Coming Soon")
- View or manage appointments
- See call history across all agents
- Recognize repeat callers for personalized experiences

Customers (SMB owners, not developers) need a simple, clear UI to manage these.

---

## 1. Contact / Caller Database

### New `Contact` model

Stores info about people who call in. When someone calls again, the voice agent recognizes them by phone number and personalizes the conversation.

```prisma
model Contact {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  phone       String
  name        String?
  email       String?
  notes       String?  @db.Text
  callCount   Int      @default(0)
  lastCalledAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, phone])
  @@index([userId])
}
```

**How it works:**
1. Call comes in → agent worker extracts caller phone from SIP attributes
2. Worker calls new webhook `POST /api/webhooks/contact-lookup` with phone number
3. If contact found: agent receives name + call history summary → personalizes greeting ("Welcome back, Sarah!")
4. After call ends: worker calls `POST /api/calls` which now also upserts a Contact record (increment callCount, update lastCalledAt, optionally update name if learned during call)

### Voice agent personalization

The system prompt gets augmented with caller context when a known contact calls:
```
The caller is a returning customer: Sarah Johnson.
They have called 3 times before. Last call was on March 10, 2026.
Previous appointments: Teeth Cleaning (Mar 5), Consultation (Feb 20).
Greet them warmly by name and reference their history.
```

---

## 2. Google Calendar Integration (Settings Page)

Replace "Coming Soon" with working connect/disconnect flow.

### States:

**Not connected:**
- "Connect Google Calendar" button (accent color)
- Subtext: "Automatically add booked appointments to your calendar"
- Clicking redirects to `/api/integrations/google` (existing OAuth flow)

**Connected:**
- Green checkmark + "Connected" badge
- Shows connected email (from integration metadata)
- "Disconnect" text button with inline confirmation
- Subtext: "Appointments booked by your voice agents appear in your calendar"

### Disconnect flow:
- `DELETE /api/integrations/google` — new endpoint
- Deletes Integration record from DB
- Does NOT revoke Google token (standard practice — user can revoke in Google settings)

---

## 3. Appointments Page — `/dashboard/appointments`

### Navigation
Add "Appointments" to TopBar nav (between Voice Agents and SMS Bot).

### Page layout

**Header:** "Appointments" title + stats row (Today: X, This Week: Y, Total: Z)

**Filters bar:** Agent dropdown | Status pills (All, Upcoming, Past, Cancelled) | Date range (optional)

**List view** (not a table — cards are more scannable for SMB owners):

Each appointment card:
```
┌──────────────────────────────────────────────────────┐
│  Teeth Cleaning                      Mar 20, 2:30 PM │
│  Sarah Johnson · +1 (555) 123-4567                   │
│  Agent: Dr. Smith's Office     ● Booked  📅 Synced   │
│                                                       │
│  [Cancel]                                             │
└──────────────────────────────────────────────────────┘
```

- Service name as title, date/time right-aligned
- Patient name + phone below
- Agent name + status badge + calendar sync indicator
- Cancel button for future BOOKED appointments (inline confirm)
- Past appointments show COMPLETED or CANCELLED state
- Calendar sync icon (checkmark if `calendarEventId` exists, dash if not)

### Empty state:
"No appointments yet. Appointments booked by your voice agents will appear here."

### API: `GET /api/appointments`
- Session-authenticated
- Filters: `agentId`, `status`, `from`/`to` date range
- Cursor pagination
- Returns appointments with agent name included

### API: `PATCH /api/appointments/[id]`
- Cancel appointment (set status to CANCELLED)
- If Google Calendar connected, delete the calendar event too

---

## 4. Calls Page — `/dashboard/calls`

### Navigation
Add "Calls" to TopBar nav (after Appointments).

### Page layout

**Header:** "Calls" title + stats (Today: X, This Week: Y, Total: Z)

**Filters:** Agent dropdown | Outcome pills (All, Completed, Missed, Escalated)

**List view:**

Each call card:
```
┌──────────────────────────────────────────────────────┐
│  +1 (555) 123-4567              Mar 16, 3:45 PM      │
│  Sarah Johnson (returning)       2m 34s               │
│  Agent: Dr. Smith's Office       ● Completed          │
│                                                       │
│  ▸ View transcript                                    │
└──────────────────────────────────────────────────────┘
```

- Caller number + date/time
- Contact name (if matched) with "returning" badge for repeat callers
- Agent name + duration + outcome badge
- Expandable transcript/summary section
- If appointments were booked during call, show link

### API: Already exists (`GET /api/calls`), needs minor updates:
- Add `agentId` and `outcome` filter params
- Include contact name via phone number lookup (join or post-query)

---

## 5. Contacts Page — `/dashboard/contacts`

### Navigation
Add "Contacts" to TopBar nav (after Calls).

### Page layout

**Header:** "Contacts" title + total count

**Search bar:** Filter by name or phone number

**List view:**

Each contact card:
```
┌──────────────────────────────────────────────────────┐
│  Sarah Johnson                                        │
│  +1 (555) 123-4567                                   │
│  4 calls · Last called Mar 16     2 appointments     │
│                                                       │
│  Notes: Prefers morning appointments                  │
└──────────────────────────────────────────────────────┘
```

- Name (or "Unknown" if not yet identified) + phone
- Call count + last called date + appointment count
- Optional notes field (editable inline)
- Click to see full call/appointment history for this contact

### API: `GET /api/contacts`
- Session-authenticated
- Search by name/phone
- Cursor pagination
- Includes call count and appointment count

### API: `PATCH /api/contacts/[id]`
- Update name, email, notes

---

## 6. Updated TopBar Navigation

```
VoiceCraft  |  Voice Agents  |  Appointments  |  Calls  |  Contacts  |  SMS Bot(Soon)  |  Chat Widget(Soon)
```

---

## 7. Agent Worker Changes

### Contact lookup on call start
New tool or startup hook in `worker.py`:
- After connecting to room and before greeting, look up caller by phone
- `POST /api/webhooks/contact-lookup` → returns contact info if found
- Augment system prompt with caller context

### Contact upsert on call end
Enhance `POST /api/calls` to:
- Look up or create Contact by `callerNumber`
- Increment `callCount`, update `lastCalledAt`
- If agent learned the caller's name during the call (from transcript/summary), update contact name

---

## Files Summary

| Action | File |
|--------|------|
| **Schema** | |
| Modify | `packages/db/prisma/schema.prisma` — add Contact model |
| **APIs** | |
| Create | `apps/web/src/app/api/appointments/route.ts` — GET list |
| Create | `apps/web/src/app/api/appointments/[id]/route.ts` — PATCH cancel |
| Create | `apps/web/src/app/api/contacts/route.ts` — GET list |
| Create | `apps/web/src/app/api/contacts/[id]/route.ts` — PATCH update |
| Create | `apps/web/src/app/api/webhooks/contact-lookup/route.ts` — lookup by phone |
| Create | `apps/web/src/app/api/integrations/google/disconnect/route.ts` — DELETE |
| Modify | `apps/web/src/app/api/calls/route.ts` — add filters, contact upsert |
| **Pages** | |
| Create | `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` |
| Create | `apps/web/src/app/dashboard/(shell)/calls/page.tsx` |
| Create | `apps/web/src/app/dashboard/(shell)/contacts/page.tsx` |
| Modify | `apps/web/src/app/dashboard/(shell)/settings/page.tsx` — wire up Google Calendar |
| **Components** | |
| Create | `apps/web/src/components/appointments/AppointmentCard.tsx` |
| Create | `apps/web/src/components/calls/CallCard.tsx` |
| Create | `apps/web/src/components/contacts/ContactCard.tsx` |
| Create | `apps/web/src/components/ui/FilterBar.tsx` — reusable filter pills |
| Create | `apps/web/src/components/ui/StatsRow.tsx` — reusable stats display |
| Modify | `apps/web/src/components/layout/TopBar.tsx` — add nav items |
| **Agent** | |
| Modify | `apps/agent/src/agent/worker.py` — contact lookup on call start |
| Modify | `apps/agent/src/agent/tools.py` — (if needed for contact context) |
