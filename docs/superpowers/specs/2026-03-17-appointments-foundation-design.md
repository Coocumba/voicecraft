# Appointments Foundation — Design Spec

**Date:** 2026-03-17
**Status:** Approved for planning
**Scope:** Backend and configuration changes that make appointment booking correct for real clinics. No new user-facing pages. Spec 2 (calendar connection flow + manual appointment creation UI) builds on top of this.

---

## Problem Statement

VoiceCraft's appointment booking has four silent failures that affect every real clinic:

1. **All agents assume they can book appointments.** An info-only or message-taking agent loads booking tools and offers appointment slots regardless of purpose.
2. **Timezone is ignored.** Slot generation is hardcoded to 09:00–17:00 UTC. A California clinic's real hours (17:00–01:00 UTC) receive zero generated slots. An India clinic is offered slots at 14:30–22:30 IST. Only UK clinics (UTC/UTC+1) see correct times.
3. **Business hours are ignored.** The availability webhook never reads the agent's `hours` config. Callers can book at 3am or on a closed Sunday.
4. **Service duration is ignored.** Every service gets 30-minute slots. A 90-minute crown procedure blocks only 30 minutes on the calendar, causing double-booking.
5. **Returning callers' upcoming appointments are hidden from the agent.** Contact lookup returns only past appointments, so the agent can't warn a caller they already have a booking next Tuesday.

---

## Scope

### In scope

- Add `can_book_appointments` and `timezone` to `AgentConfig` type and builder generation
- Update availability webhook to respect timezone, business hours, and service duration
- Update contact lookup webhook to return upcoming appointments separately from past ones
- Update Python voice agent to conditionally load booking tools based on `can_book_appointments`

### Out of scope

- New UI pages (covered in Spec 2)
- Google Calendar connection flow (covered in Spec 2)
- Manual appointment creation (covered in Spec 2)
- Race condition / slot locking
- Appointment rescheduling
- SMS retry or delivery receipts
- HIPAA audit trail
- Per-appointment timezone display on the dashboard (requires Spec 2 UI work)

---

## 1. AgentConfig Changes

### 1.1 New fields

Add two fields to the `AgentConfig` TypeScript interface in `apps/web/src/lib/builder-types.ts`:

```typescript
export interface AgentConfig {
  // ... existing fields ...
  can_book_appointments?: boolean  // default false — agent must opt in to booking
  timezone?: string                 // IANA timezone string, e.g. "America/Los_Angeles"
}
```

**`can_book_appointments`**
- `false` (default): agent does not offer availability checking or appointment booking
- `true`: agent loads booking tools and can schedule appointments
- Defaults to `false` so existing agents without the field behave as booking-enabled only after the builder regenerates their config. During the transition, the Python agent falls back to `true` if the field is absent (preserving current behaviour for existing deployed agents).

**`timezone`**
- IANA timezone string (e.g. `"America/New_York"`, `"Asia/Kolkata"`, `"Europe/London"`)
- Used by the availability webhook when generating slots and querying Google Calendar
- Falls back to `"UTC"` if absent
- Validated against the IANA database on write; invalid values are rejected with a 400

### 1.2 Builder generation update

`apps/web/src/app/api/builder/generate/route.ts` — update the extraction prompt to produce both new fields:

**`can_book_appointments`:** Set to `true` if the business description mentions scheduling, booking, appointments, reservations, or similar. Set to `false` for info-only, FAQ, or message-taking agents.

**`timezone`:** Extract from business location if mentioned ("dental clinic in Chicago" → `"America/Chicago"`). If location is ambiguous or not mentioned, set to `null` in the generated config. The voice agent does **not** ask the caller for timezone during a live call — that would be a poor experience. Instead, the availability webhook falls back to `"UTC"` when `timezone` is `null`. The Spec 2 UI will surface a timezone prompt to the clinic owner during agent setup so they can fill this in before going live.

---

## 2. Availability Webhook

**File:** `apps/web/src/app/api/webhooks/availability/route.ts`

### 2.1 Current behaviour (broken)

- Generates slots hardcoded to 09:00–17:00 UTC regardless of agent config
- Ignores `hours` field entirely
- Uses 30-minute slot duration for every service

### 2.2 New behaviour

**Step 1 — Resolve timezone**

```
timezone = agentConfig.timezone ?? "UTC"
```

All subsequent date/time operations use this timezone.

**Step 2 — Parse requested date in clinic's timezone**

The incoming `date` field (e.g. `"2026-03-21"` or `"next Friday"`) is interpreted as a date in the clinic's timezone, not UTC. Natural language parsing (already in place) produces a date string; that date's midnight is then computed in the clinic's timezone.

**Step 3 — Determine open hours for the requested day**

```
dayOfWeek = getDayName(requestedDate, timezone)  // e.g. "monday"
dayHours = agentConfig.hours?.[dayOfWeek]
```

- If `dayHours` is `null` (day explicitly closed): return `{ slots: [], reason: "closed" }`
- If `agentConfig.hours` is not set: use 09:00–17:00 in the clinic's timezone as default
- Otherwise use `dayHours.open` and `dayHours.close` (already stored as "HH:MM" strings)

**Step 4 — Determine slot duration**

```
service = agentConfig.services?.find(s => s.name.toLowerCase() === requestedService.toLowerCase())
durationMinutes = service?.duration ?? 30
```

If the service is not found in config, default to 30 minutes.

**Step 5 — Generate candidate slots**

Generate slots from `open` to `close - durationMinutes` at `durationMinutes` intervals, in the clinic's timezone. Convert each to UTC for Google Calendar comparison and for storage in the returned slot list (ISO 8601 with Z suffix).

Example: Clinic in `"America/Chicago"` open 10:00–16:00, service duration 60 min → slots at 10:00, 11:00, 12:00, 13:00, 14:00, 15:00 Chicago time → returned as UTC ISO strings.

**Step 6 — Filter against Google Calendar (if connected)**

Query Google Calendar using the clinic-timezone-aware day boundaries (not UTC midnight boundaries). Mark slots as unavailable if any calendar event overlaps the slot window `[slotStart, slotStart + duration)`.

**Step 7 — Filter mock slots (if no calendar)**

The mock and real paths share a single `generateSlots(open, close, durationMinutes, timezone)` helper that returns a list of UTC ISO strings. This function is extracted from the current hardcoded logic and used by both paths. The mock path then applies the existing deterministic filter (`seed % 4 !== 0`) over the generated list. This ensures both paths respect business hours and service duration consistently.

### 2.3 Response shape

```typescript
// Success
{ slots: string[], source: "google_calendar" | "mock" }

// Closed day (slots is empty; reason is optional field)
{ slots: [], source: "google_calendar" | "mock", reason: "closed" }
```

Slots remain UTC ISO strings so the voice agent and frontend don't need to change their parsing. The current route also echoes back `agentId`, `date`, and `service` in the response body — these echo fields are intentionally dropped in the new shape. The Python `check_availability` tool does not read them, so removal is safe.

### 2.4 Error cases

| Condition | Response |
|-----------|----------|
| Agent not found | Return `{ slots: [], source: "mock" }` immediately without generating slots |
| Day is closed | `{ slots: [], source: "google_calendar" \| "mock", reason: "closed" }` |
| Invalid timezone in config | Fall back to `"UTC"`, log warning, continue |
| Google Calendar error | Fall back to mock slots (existing behaviour) |

**Agent not found:** When no agent matches the given `agentId`, return an empty slot list immediately. Do not proceed to slot generation or mock fallback — there is no config to read business hours or timezone from.

---

## 3. Google Calendar Query Fix

**File:** `apps/web/src/lib/google-calendar.ts`

### 3.1 `checkAvailability` signature change

Add `timezone` parameter:

```typescript
export async function checkAvailability(
  userId: string,
  date: string,
  service: string,
  timezone: string = "UTC"
): Promise<{ slots: string[]; eventId?: string }>
```

### 3.2 Date boundary computation

Replace hardcoded UTC midnight boundaries:

```typescript
// Before (broken for non-UTC)
const dayStart = new Date(`${dateStr}T00:00:00Z`)
const dayEnd   = new Date(`${dateStr}T24:00:00Z`)  // T24 is valid ISO 8601 but risky in JS

// After — boundaries in clinic's timezone
const dayStart = toUTC(`${dateStr}T00:00:00`, timezone)
const dayEnd   = toUTC(`${dateStr}T00:00:00`, timezone, +1)  // midnight of next day
```

`toUTC(localDateTimeStr, timezone, dayOffset = 0)` converts a local datetime string to a UTC `Date` using the `Intl` API (no new dependencies). The day boundary uses midnight of the **next** day (`+1`) rather than `T24:00:00Z` to avoid engine-specific parsing differences with `T24`. Implement using `Intl`-based conversion (not fixed UTC offset arithmetic) so DST transitions are handled correctly — e.g. clocks-forward nights where midnight technically doesn't exist resolve correctly via `Intl`.

### 3.3 `bookAppointment` — no signature change needed

`scheduledAt` is already a UTC `Date` passed in from the caller. No change required.

---

## 4. Python Voice Agent — Conditional Tool Loading

**File:** `apps/agent/src/agent/worker.py`

### 4.1 Current behaviour

`DentalReceptionist` always loads `[check_availability, book_appointment, send_sms]` regardless of config.

### 4.2 New behaviour

`DentalReceptionist.__init__` currently hardcodes tools inside `super().__init__()`. The constructor must be updated to accept a `tools: list` parameter and forward it to `super().__init__()`, removing the hardcoded list. The call site in `entrypoint` then passes the dynamically built list.

In `entrypoint` (the session startup function in `worker.py`), build the tools list before constructing the agent:

```python
tools = [send_sms]  # always available

if config.get("can_book_appointments", True):  # True = backward-compatible default
    tools += [check_availability, book_appointment]

agent = DentalReceptionist(..., tools=tools)
```

**`prompts.py`:** `build_system_prompt(config: dict) -> str` receives the full config dict. Add a `can_book = config.get("can_book_appointments", True)` check inside the function to conditionally include or omit the booking instructions block. No signature change needed.

### 4.3 Timezone in availability tool call

`check_availability` and `book_appointment` are `@function_tool` decorators in `tools.py`. They receive only `RunContext` (which today carries `userdata["agent_id"]`). To pass `timezone` without changing the tool's public signature (which the LLM sees), add `timezone` to `userdata` at session startup alongside `agent_id`:

```python
# In entrypoint / session setup in worker.py
ctx.userdata = {
    "agent_id": agent_id,
    "timezone": config.get("timezone", "UTC"),
}
```

Inside the `check_availability` tool function:

```python
async def check_availability(ctx: RunContext, date: str, service: str) -> str:
    payload = {
        "agentId": ctx.userdata["agent_id"],
        "date": date,
        "service": service,
        "timezone": ctx.userdata.get("timezone", "UTC"),
    }
```

This pattern is consistent with how `agent_id` is currently accessed in the tools and requires no new infrastructure.

---

## 5. Contact Lookup Webhook

**File:** `apps/web/src/app/api/webhooks/contact-lookup/route.ts`

### 5.1 Current behaviour

Returns up to 5 most recent appointments ordered by `scheduledAt` descending. No distinction between past and upcoming.

### 5.2 New behaviour

Return two separate lists:

```typescript
const now = new Date()

const [pastAppointments, upcomingAppointments] = await Promise.all([
  prisma.appointment.findMany({
    where: {
      patientPhone: normalizedPhone,
      agent: { userId: agent.userId },
      scheduledAt: { lt: now },
    },
    orderBy: { scheduledAt: "desc" },
    take: 3,
    select: { service: true, scheduledAt: true, status: true },
  }),
  prisma.appointment.findMany({
    where: {
      patientPhone: normalizedPhone,
      agent: { userId: agent.userId },
      scheduledAt: { gte: now },
      status: AppointmentStatus.BOOKED,
    },
    orderBy: { scheduledAt: "asc" },
    take: 2,
    select: { service: true, scheduledAt: true, status: true },
  }),
])
```

### 5.3 Response shape change

```json
{
  "contact": { "name": "Sarah Johnson", "callCount": 3 },
  "appointments": {
    "upcoming": [
      { "service": "Teeth Cleaning", "scheduledAt": "2026-03-25T15:00:00Z", "status": "BOOKED" }
    ],
    "past": [
      { "service": "X-Ray", "scheduledAt": "2026-01-10T14:00:00Z", "status": "COMPLETED" }
    ]
  }
}
```

### 5.4 Python agent update

**`worker.py` — `_lookup_contact`:** The function currently extracts `data.get("contact")` and returns a flat contact dict. After this change, the response contains a top-level `appointments` key separate from `contact`. Update `_lookup_contact` to return both. All three call sites in `worker.py` that currently unpack `_lookup_contact()` must be updated together: the truthiness check (`if contact:`), the `build_caller_context_suffix` call, and any `get_greeting` call that reads contact fields.

```python
def _lookup_contact(data: dict) -> tuple[dict | None, dict]:
    contact = data.get("contact")
    appointments = data.get("appointments", {"upcoming": [], "past": []})
    return contact, appointments
```

**`prompts.py` — `build_caller_context_suffix(contact, appointments)`:**

Current signature: `build_caller_context_suffix(contact: dict | None) -> str` reading `contact.get("recentAppointments")`.

New signature: `build_caller_context_suffix(contact: dict | None, appointments: dict) -> str`

`appointments` has shape `{"upcoming": [...], "past": [...]}` where each item is `{"service": str, "scheduledAt": str, "status": str}`.

The function builds the context string as:
- For each item in `appointments["upcoming"]`: *"This caller has an upcoming [service] on [formatted date]."*
- For the first item in `appointments["past"]` (if any): *"This caller's last visit was [formatted date] for [service]."*
- If both lists are empty and `contact` is None: return empty string (unknown caller).

---

## 6. Data Model — No Schema Changes Required

All changes are in application logic. The `Appointment`, `Agent`, and `AgentConfig` (stored as `Json`) models require no Prisma schema changes. The new `AgentConfig` fields are additive — existing agents without them fall back to safe defaults.

---

## 7. Migration / Backward Compatibility

| Existing agent | Behaviour after deploy |
|----------------|------------------------|
| No `can_book_appointments` field | Treated as `true` (Python agent backward-compat default) — keeps booking tools loaded |
| No `timezone` field | Falls back to `"UTC"` — same as current (broken but not worse) |
| No `hours` field | Falls back to 09:00–17:00 in agent's timezone — same slot count as today |

Clinic owners are unaffected until they regenerate their agent config through the builder, at which point both new fields are populated correctly.

---

## 8. Testing Approach

| Test | What to verify |
|------|----------------|
| Availability with timezone | Chicago clinic gets slots in local hours, not UTC |
| Closed day | Returns empty slots when day is marked closed |
| Service duration | 60-min service generates 60-min slots, not 30-min |
| Google Calendar boundaries | Events at day-edge in local timezone are correctly included/excluded |
| `can_book_appointments: false` | Agent doesn't load booking tools; prompt has no booking section |
| Contact lookup | Upcoming and past returned separately; only BOOKED future shown as upcoming |
| Backward compat | Agent with no new fields behaves as before |
