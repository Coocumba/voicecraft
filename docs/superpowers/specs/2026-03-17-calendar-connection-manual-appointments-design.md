# Calendar Connection Flow + Manual Appointment Creation — Design Spec

**Date:** 2026-03-17
**Status:** Approved for planning
**Scope:** User-facing UI changes that surface Google Calendar connection at the right moments and allow manual appointment creation from the dashboard. Builds on top of the Appointments Foundation spec (Spec 1).
**Depends on:** `2026-03-17-appointments-foundation-design.md` (agent capabilities, timezone, business hours — already implemented)

---

## Problem Statement

1. **Google Calendar connection is buried in Settings.** Most clinic owners never find it. Without it, the voice agent offers fake mock slots, leading to double-bookings the user doesn't discover until patients show up at the same time.
2. **No way to manually create appointments.** Walk-ins, front-desk calls, and planned bookings can only be entered if the voice agent creates them. The receptionist has no way to add appointments from the dashboard.

---

## Scope

### In scope

- Interstitial page after agent generation prompting calendar connection (for booking agents)
- GuidedNextSteps expanded with calendar step (for booking agents without calendar)
- Persistent warning banner on agent detail page (for booking agents without calendar)
- Calendar nudge banner on appointments dashboard
- Manual appointment creation drawer on appointments dashboard
- POST `/api/appointments` endpoint
- Google Calendar OAuth redirect update (return to correct page after connection)

### Out of scope

- Appointment rescheduling
- Slot-based picker in the manual creation form (receptionist uses a simple date/time picker)
- SMS confirmation on manual creation
- In-chat calendar connection (builder chat modifications)
- Timezone display on existing appointment cards (separate improvement)

---

## 1. Interstitial Page — Connect Calendar After Generation

### 1.1 Route

**New page:** `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx`

Uses the shell layout (TopBar visible for navigation context).

### 1.2 Server component logic

```
1. Auth guard — redirect to /login if no session
2. Fetch agent — verify ownership, check config.can_book_appointments
3. Check for existing Google Calendar integration
4. If calendar already connected OR can_book_appointments is false:
     → redirect to /dashboard/voice-agents/[id]?new=true
5. Otherwise: render the interstitial UI
```

### 1.3 UI

```
[Page content — centered, max-w-lg]

  Heading (font-serif): "Connect your calendar"
  Subheading: "{agentName} books appointments. Connect Google Calendar
              so it uses your real availability — otherwise it'll offer
              placeholder time slots that may conflict with your schedule."

  [Connect Google Calendar]  ← primary button, links to /api/integrations/google
                               with a return URL parameter (see Section 1.5)

  "Skip for now →"           ← text link, navigates to /dashboard/voice-agents/[id]?new=true
```

### 1.4 Builder redirect change

**File:** `apps/web/src/app/api/builder/generate/route.ts` (or the client-side navigation after generation)

After the agent is created, the builder page currently navigates to `/dashboard/voice-agents/[id]?new=true`. Change this to navigate to `/dashboard/voice-agents/[id]/connect-calendar` instead.

The interstitial page handles the routing: if calendar is already connected or the agent doesn't book, it immediately redirects to the detail page with `?new=true`.

### 1.5 OAuth return URL

The Google OAuth flow currently redirects back to `/dashboard/settings` after the callback. To support contextual return, add a `returnTo` query parameter to the OAuth initiation:

**File:** `apps/web/src/app/api/integrations/google/route.ts`

Read an optional `returnTo` query param from the request URL. Store it in the OAuth state cookie (alongside the CSRF token). After the callback completes, redirect to `returnTo` instead of `/dashboard/settings`.

**From interstitial:** The "Connect Google Calendar" button links to `/api/integrations/google?returnTo=/dashboard/voice-agents/[id]?new=true`

**From appointments dashboard:** Links to `/api/integrations/google?returnTo=/dashboard/appointments`

**From settings:** No `returnTo` param → defaults to `/dashboard/settings` (existing behavior).

**Validation:** `returnTo` must start with `/dashboard/` to prevent open redirect attacks. Reject or ignore any other value.

**URL encoding:** Links that pass `returnTo` as a query parameter must URL-encode the value since it may contain its own query string (e.g. `/dashboard/voice-agents/[id]?new=true`). Use `encodeURIComponent(returnTo)` when building the link.

**Cookie storage:** The current OAuth state cookie stores a plain hex CSRF token. To add `returnTo`, encode both as JSON in the cookie value: `JSON.stringify({ csrf: state, returnTo })`. The callback reads `JSON.parse(cookieValue)` to extract both fields. The CSRF comparison uses the `csrf` field; the redirect uses `returnTo` with the `/dashboard/` prefix validation.

**Files affected:**
- `apps/web/src/app/api/integrations/google/route.ts` — read `returnTo`, store JSON cookie
- `apps/web/src/app/api/integrations/google/callback/route.ts` — parse JSON cookie, redirect to `returnTo` after success

### 1.6 Loading skeleton

**New file:** `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/loading.tsx`

Simple centered skeleton matching the page layout.

---

## 2. GuidedNextSteps — Calendar Step

### 2.1 Current state

`GuidedNextSteps` shows two cards: "Test your agent" and "Get a phone number". It receives `agentId`, `agentName`, and `hasTested` props.

### 2.2 New props

Add `needsCalendar: boolean` to the component props. The server component (agent detail page) computes this:

```typescript
const needsCalendar =
  config?.can_book_appointments === true &&
  !(await prisma.integration.findFirst({
    where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
    select: { id: true },
  }))
```

### 2.3 New step

When `needsCalendar` is true, prepend a step before "Test your agent":

```
Step 1: Connect Google Calendar  (warning style — amber border)
  "Without this, your agent offers placeholder availability and
   patients may book conflicting times."
  [Connect Google Calendar]  → /api/integrations/google?returnTo=/dashboard/voice-agents/[id]?new=true

Step 2: Test your agent          (existing)
Step 3: Get a phone number       (existing, renumbered)
```

When `needsCalendar` is false (calendar connected or agent doesn't book): show the existing two steps unchanged.

### 2.4 Server component changes

**File:** `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`

Add the Google Calendar integration check to the `Promise.all` data fetch. Pass `needsCalendar` to `GuidedNextSteps`.

---

## 3. Persistent Warning Banner

### 3.1 Location

On the agent detail page, between the stats row and the phone number card. Only shown when:
- Agent config has `can_book_appointments: true`
- User has no Google Calendar integration

### 3.2 UI

```
[Warning banner — amber background, not dismissible]

  "Your agent offers placeholder availability because Google Calendar
   isn't connected. Patients may book conflicting times."

  [Connect Google Calendar]  → /api/integrations/google?returnTo=/dashboard/voice-agents/[id]
```

### 3.3 Implementation

The server component already fetches agent config. Add the integration check (same query as GuidedNextSteps — reuse the result). Render the banner inline in the page JSX, not as a separate component.

---

## 4. Appointments Dashboard — Calendar Nudge

### 4.1 Location

On the appointments dashboard, between the stats row and the filter bar. Only shown when user has no Google Calendar integration.

### 4.2 UI

```
[Info banner — blue background]

  "Connect Google Calendar to avoid double-bookings and sync appointments
   automatically."

  [Connect Google Calendar]  → /api/integrations/google?returnTo=/dashboard/appointments
```

### 4.3 Implementation

**File:** `apps/web/src/app/dashboard/(shell)/appointments/page.tsx`

Add integration check to the server component's data fetch. Render the banner conditionally.

---

## 5. Manual Appointment Creation

### 5.1 Entry point

"New Appointment" button on the appointments dashboard header, right-aligned next to the page title.

Only shown when the user has at least one agent with `can_book_appointments: true`.

### 5.2 Drawer component

**New file:** `apps/web/src/components/appointments/NewAppointmentDrawer.tsx`

A slide-out drawer (right side) with a backdrop overlay. Client component.

**Fields:**

| Field | Type | Required | Source |
|-------|------|----------|--------|
| Agent | dropdown | yes | User's agents where `can_book_appointments: true` |
| Service | dropdown | yes | Selected agent's `config.services` |
| Patient name | text input | yes | Free text |
| Patient phone | text input | no | Placeholder: "+1 (555) 123-4567" |
| Date | date input | yes | Native `<input type="date">` |
| Time | time input | yes | Native `<input type="time">` |

**Behavior:**
- Agent dropdown defaults to the first agent (or the one selected in the filter)
- Service dropdown populates dynamically when agent is selected, from agent's `config.services`
- If no services in config, show a free-text input instead
- Date defaults to today
- Time defaults to empty (user must choose)

**Calendar sync notice** (inside the drawer, before submit):
- If Google Calendar connected: show "This appointment will be synced to Google Calendar." (green text, small)
- If not connected: show "This appointment won't sync to Google Calendar." with a "Connect now" link

**Submit flow:**
1. Validate all required fields
2. Combine date + time into ISO 8601 UTC datetime
3. POST `/api/appointments` with `{ agentId, service, patientName, patientPhone, scheduledAt }`
4. Success → toast "Appointment created" + close drawer + `router.refresh()`
5. Error → toast with error message, keep drawer open

### 5.3 Data passing

The appointments page server component fetches booking agents with their configs:

```typescript
const bookingAgents = await prisma.agent.findMany({
  where: {
    userId: session.user.id,
    // Filter for agents with can_book_appointments in config
    // Since config is Json, we can't filter in Prisma — fetch all and filter in JS
  },
  select: { id: true, name: true, config: true },
})

const agentsWithBooking = bookingAgents.filter((a) => {
  const config = a.config as AgentConfig | null
  return config?.can_book_appointments === true
})
```

Pass `agentsWithBooking` (with their configs' services) to `AppointmentsClient`, which passes them to `NewAppointmentDrawer`.

---

## 6. POST /api/appointments Endpoint

### 6.1 Route

**New file:** `apps/web/src/app/api/appointments/route.ts` — add POST handler alongside existing GET.

Wait — check if this file already exists with a GET handler. If so, add POST to the same file.

### 6.2 Request body

```typescript
{
  agentId: string       // required
  service: string       // required
  patientName: string   // required
  patientPhone?: string // optional
  scheduledAt: string   // required, ISO 8601 UTC datetime
}
```

### 6.3 Validation

- Session authenticated (same as GET)
- Agent exists and belongs to user
- Agent's config has `can_book_appointments: true`
- `scheduledAt` is a valid future datetime
- `patientName` is non-empty
- `service` is non-empty
- `patientPhone`, if provided, is trimmed and non-empty

### 6.4 Implementation

```typescript
// 1. Create the appointment record
const appointment = await prisma.appointment.create({
  data: {
    agentId,
    patientName,
    patientPhone: patientPhone ?? null,
    scheduledAt: new Date(scheduledAt),
    service,
    status: AppointmentStatus.BOOKED,
    callId: null,  // manually created, not from a call
  },
})

// 2. Sync to Google Calendar if connected (non-fatal)
let calendarEventId: string | null = null
try {
  const integration = await prisma.integration.findFirst({
    where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
  })
  if (integration) {
    const result = await bookAppointment(session.user.id, {
      patientName,
      patientPhone,
      scheduledAt,
      service,
      durationMinutes: agentConfig?.services?.find(
        (s) => s.name.toLowerCase() === service.toLowerCase()
      )?.duration,
    })
    calendarEventId = result.eventId
    // Update the appointment with the calendar event ID
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { calendarEventId },
    })
  }
} catch (err) {
  console.error("[POST /api/appointments] Google Calendar sync failed (non-fatal)", err)
}

return Response.json({ appointment }, { status: 201 })
```

### 6.5 Error cases

| Condition | Response |
|-----------|----------|
| Not authenticated | 401 |
| Agent not found or not owned by user | 404 |
| Agent doesn't have `can_book_appointments: true` | 403 "This agent is not configured for appointment booking" |
| `scheduledAt` is in the past | 400 "Appointment must be in the future" |
| Missing required fields | 400 with field-specific message |
| Google Calendar sync fails | Appointment created successfully (201), calendar sync is non-fatal |

---

## 7. File Summary

| File | Action |
|------|--------|
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx` | **New** — interstitial page |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/loading.tsx` | **New** — skeleton |
| `apps/web/src/app/api/integrations/google/route.ts` | Modify — add `returnTo` param support |
| `apps/web/src/app/api/integrations/google/callback/route.ts` | Modify — redirect to `returnTo` after success |
| `apps/web/src/components/agents/GuidedNextSteps.tsx` | Modify — add calendar step |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify — add calendar integration check, warning banner, pass `needsCalendar` |
| `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` | Modify — add calendar nudge banner, fetch booking agents, pass to client |
| `apps/web/src/components/appointments/AppointmentsClient.tsx` | Modify — add "New Appointment" button, render drawer |
| `apps/web/src/components/appointments/NewAppointmentDrawer.tsx` | **New** — manual creation drawer |
| `apps/web/src/app/api/appointments/route.ts` | Modify — add POST handler |

---

## 8. Navigation Flow After Connection

The `returnTo` parameter ensures users land back where they came from:

| Context | returnTo | User lands at |
|---------|----------|---------------|
| Interstitial (new agent) | `/dashboard/voice-agents/[id]?new=true` | Agent detail with GuidedNextSteps |
| Agent detail banner | `/dashboard/voice-agents/[id]` | Agent detail (banner now gone) |
| GuidedNextSteps | `/dashboard/voice-agents/[id]?new=true` | Agent detail (calendar step now checked) |
| Appointments dashboard | `/dashboard/appointments` | Appointments (nudge now gone) |
| Settings page | (default) `/dashboard/settings` | Settings (existing behavior) |

---

## 9. Builder Redirect Change

**File:** The builder page client component that navigates after agent creation.

Change the post-generation navigation from:
```
/dashboard/voice-agents/[id]?new=true
```
to:
```
/dashboard/voice-agents/[id]/connect-calendar
```

The interstitial page handles all the logic — if calendar is already connected or agent doesn't book, it redirects transparently to the detail page.

---

## 10. Edge Cases

| Case | Behavior |
|------|----------|
| User already has Google Calendar connected | Interstitial redirects straight to agent detail. GuidedNextSteps shows 2 steps (no calendar step). No warning banners anywhere. |
| User creates second booking agent | Calendar already connected → same as above |
| Non-booking agent created | Interstitial redirects straight to agent detail. No calendar prompts. |
| User disconnects Google Calendar after connecting | Warning banner reappears on agent detail. Nudge reappears on appointments dashboard. |
| OAuth flow fails | User stays on Google's error page. No VoiceCraft state change. |
| `returnTo` is a malicious URL | Rejected — must start with `/dashboard/`. Defaults to `/dashboard/settings`. |
| Manual appointment creation without calendar | Appointment created in DB only. Drawer shows "won't sync" notice. |
| Agent has no services in config | Service field becomes free-text input instead of dropdown |
| User has no booking agents | "New Appointment" button not shown on appointments dashboard |

---

## 11. Testing Approach

| Test | What to verify |
|------|----------------|
| Interstitial — booking agent, no calendar | Renders interstitial with connect button and skip link |
| Interstitial — booking agent, calendar connected | Redirects to agent detail |
| Interstitial — non-booking agent | Redirects to agent detail |
| GuidedNextSteps — with `needsCalendar: true` | Shows 3 steps with calendar first |
| GuidedNextSteps — with `needsCalendar: false` | Shows 2 steps (existing behavior) |
| Warning banner — booking agent, no calendar | Banner visible, not dismissible |
| Warning banner — booking agent, calendar connected | Banner not rendered |
| Appointments nudge — no calendar | Banner visible |
| OAuth `returnTo` — valid path | Redirects to specified dashboard path |
| OAuth `returnTo` — invalid/external URL | Falls back to `/dashboard/settings` |
| POST /api/appointments — valid request | Creates appointment + calendar event |
| POST /api/appointments — calendar sync fails | Creates appointment anyway (201) |
| POST /api/appointments — non-booking agent | Returns 403 |
| POST /api/appointments — past date | Returns 400 |
| New Appointment drawer — services from config | Dropdown populated from agent config |
| New Appointment drawer — no services | Free-text input shown |
