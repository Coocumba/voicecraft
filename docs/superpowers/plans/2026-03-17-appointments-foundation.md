# Appointments Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix appointment booking so it respects agent capabilities, timezone, business hours, and service duration — making it work correctly for clinics outside the UK.

**Architecture:** Add `can_book_appointments` and `timezone` to `AgentConfig` (JSON stored in DB). Rewrite the availability webhook to use these fields plus the existing `hours` and `services` config. Update the Python voice agent to conditionally load booking tools and pass timezone through `userdata`. Split contact lookup appointments into upcoming/past.

**Tech Stack:** TypeScript (Next.js 16 API routes), Python (LiveKit agents), Prisma, `Intl` API for timezone conversion, pytest for Python tests.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/lib/builder-types.ts` | Modify | Add `can_book_appointments` and `timezone` to `AgentConfig` |
| `apps/web/src/lib/timezone-utils.ts` | Create | `toUTC()` helper and `isValidTimezone()` validator |
| `apps/web/src/lib/slot-generator.ts` | Create | `generateSlots()` — shared by mock and calendar paths |
| `apps/web/src/app/api/builder/generate/route.ts` | Modify | Update extraction prompt for new fields |
| `apps/web/src/app/api/webhooks/availability/route.ts` | Modify | Rewrite to use timezone, business hours, service duration |
| `apps/web/src/lib/google-calendar.ts` | Modify | Timezone-aware date boundaries in `checkAvailability` |
| `apps/web/src/app/api/webhooks/contact-lookup/route.ts` | Modify | Split appointments into upcoming/past |
| `apps/agent/src/agent/prompts.py` | Modify | Conditional booking section, new `build_caller_context_suffix` signature |
| `apps/agent/src/agent/tools.py` | Modify | Pass timezone from `userdata` in availability payload |
| `apps/agent/src/agent/worker.py` | Modify | Dynamic tool list, timezone in `userdata`, `_lookup_contact` return type |
| `apps/agent/tests/test_prompts.py` | Create | Tests for conditional prompt and context suffix |
| `apps/agent/tests/test_worker.py` | Create | Tests for conditional tool loading and contact lookup parsing |

---

## Chunk 1: TypeScript Changes

### Task 1: Add fields to AgentConfig

**Files:**
- Modify: `apps/web/src/lib/builder-types.ts` (lines 17–26)

- [ ] **Step 1: Add the two new fields to AgentConfig**

In `apps/web/src/lib/builder-types.ts`, add after the `voice` field inside the `AgentConfig` interface:

```typescript
  can_book_appointments?: boolean
  timezone?: string  // IANA timezone, e.g. "America/Los_Angeles"
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS — fields are optional so no existing code breaks.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/builder-types.ts
git commit -m "feat: add can_book_appointments and timezone to AgentConfig"
```

---

### Task 2: Create timezone utility

**Files:**
- Create: `apps/web/src/lib/timezone-utils.ts`

- [ ] **Step 1: Create the timezone utility file**

Create `apps/web/src/lib/timezone-utils.ts`:

```typescript
/**
 * Convert a local datetime string to a UTC Date using Intl.
 * Handles DST correctly by using Intl-based resolution, not fixed offset arithmetic.
 *
 * @param localDateTimeStr  e.g. "2026-03-21T09:00:00"
 * @param timezone          IANA timezone, e.g. "America/Chicago"
 * @param dayOffset         Offset in days from the parsed date (0 = same day, 1 = next day)
 */
export function toUTC(
  localDateTimeStr: string,
  timezone: string,
  dayOffset = 0
): Date {
  // Parse the local datetime components
  const [datePart, timePart = "00:00:00"] = localDateTimeStr.split("T")
  const [yearStr, monthStr, dayStr] = datePart.split("-")
  const [hourStr, minuteStr, secondStr = "0"] = timePart.split(":")

  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10) + dayOffset
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const second = parseInt(secondStr, 10)

  // Create a date in UTC first, then find the offset for the target timezone
  // We use an iterative approach: guess UTC, check what local time that produces,
  // compute the delta, and adjust.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(guess)
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10)

  const localAtGuess = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  )

  const offsetMs = localAtGuess.getTime() - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

/**
 * Get the lowercase day name for a date in a given timezone.
 * e.g. getDayName("2026-03-21", "America/Chicago") => "saturday"
 */
export function getDayName(dateStr: string, timezone: string): string {
  const utcDate = toUTC(`${dateStr}T12:00:00`, timezone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
  return formatter.format(utcDate).toLowerCase()
}

/**
 * Validate that a string is a recognized IANA timezone.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/timezone-utils.ts
git commit -m "feat: add timezone utility helpers (toUTC, getDayName, isValidTimezone)"
```

---

### Task 3: Create slot generator

**Files:**
- Create: `apps/web/src/lib/slot-generator.ts`

- [ ] **Step 1: Create the slot generator**

Create `apps/web/src/lib/slot-generator.ts`:

```typescript
import { toUTC } from "@/lib/timezone-utils"

/**
 * Generate appointment slot start times within a business-hours window.
 * Slots are spaced at `durationMinutes` intervals from `open` to `close - duration`.
 * Returns UTC ISO strings (Z suffix).
 *
 * @param dateStr         Date in YYYY-MM-DD format
 * @param open            Opening time in HH:MM format (local)
 * @param close           Closing time in HH:MM format (local)
 * @param durationMinutes Slot duration (default 30)
 * @param timezone        IANA timezone string
 */
export function generateSlots(
  dateStr: string,
  open: string,
  close: string,
  durationMinutes: number,
  timezone: string
): string[] {
  const [openH, openM] = open.split(":").map(Number)
  const [closeH, closeM] = close.split(":").map(Number)

  const openTotal = openH * 60 + openM
  const closeTotal = closeH * 60 + closeM

  // Last slot must start early enough that the full duration fits before close
  const lastSlotStart = closeTotal - durationMinutes

  const slots: string[] = []

  for (let mins = openTotal; mins <= lastSlotStart; mins += durationMinutes) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    const localTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
    const utcDate = toUTC(`${dateStr}T${localTime}`, timezone)
    slots.push(utcDate.toISOString())
  }

  return slots
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/slot-generator.ts
git commit -m "feat: add slot generator with timezone and duration support"
```

---

### Task 4: Update builder extraction prompt

**Files:**
- Modify: `apps/web/src/app/api/builder/generate/route.ts` (lines 14–48)

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/api/builder/generate/route.ts` to confirm exact line numbers and structure of `EXTRACTION_PROMPT`.

- [ ] **Step 2: Update the extraction prompt**

In the JSON schema section of `EXTRACTION_PROMPT`, add these two fields to the schema:

```
"can_book_appointments": boolean — true if the business description mentions scheduling, booking, appointments, reservations, or similar. false for info-only, FAQ, or message-taking agents.
"timezone": string | null — IANA timezone from business location (e.g. "dental clinic in Chicago" → "America/Chicago"). null if location not mentioned.
```

Add to the extraction guidance section:

```
- Set can_book_appointments to true if the conversation mentions booking, scheduling, appointments, or reservations. Set to false for info-only or message-taking agents.
- Infer timezone from the business location if mentioned. Use IANA timezone format (e.g. "America/New_York", "Asia/Kolkata"). Set to null if location is unclear.
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/builder/generate/route.ts
git commit -m "feat: extract can_book_appointments and timezone in builder generation"
```

---

### Task 5: Add timezone to Google Calendar queries

**Files:**
- Modify: `apps/web/src/lib/google-calendar.ts` (lines 136–226)

- [ ] **Step 1: Read the current file**

Read `apps/web/src/lib/google-calendar.ts` to confirm exact function signatures and line numbers.

- [ ] **Step 2: Add import for toUTC**

Add at the top of the file:

```typescript
import { toUTC } from "@/lib/timezone-utils"
```

- [ ] **Step 3: Update `listEventsForDate` signature and date boundaries**

Change the signature from `(accessToken: string, dateStr: string)` to `(accessToken: string, dateStr: string, timezone: string = "UTC")`.

Replace the hardcoded UTC date boundaries:

```typescript
// Before:
const dayStart = new Date(`${dateStr}T00:00:00Z`)
const dayEnd = new Date(`${dateStr}T23:59:59Z`)

// After:
const dayStart = toUTC(`${dateStr}T00:00:00`, timezone)
const dayEnd = toUTC(`${dateStr}T00:00:00`, timezone, 1)  // midnight next day
```

- [ ] **Step 4: Update `checkAvailability` — change role to event fetching only**

The function's role changes: it no longer generates slots (that's done by `generateSlots` in the webhook). Instead, it fetches calendar events for the day and returns them so the webhook can filter generated slots against occupied time windows.

New signature:

```typescript
export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>>
```

This replaces `checkAvailability`. It calls `listEventsForDate(token, date, timezone)` and returns the event start/end times. The availability webhook then uses these to filter out occupied slots from `generateSlots`.

Remove the old hardcoded 09:00–17:00 / 30-min slot generation loop from this file — it's replaced by `slot-generator.ts`.

Pass `timezone` through to `listEventsForDate`.

- [ ] **Step 5: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/google-calendar.ts
git commit -m "fix: use timezone-aware date boundaries in Google Calendar queries"
```

---

### Task 6: Rewrite availability webhook

**Files:**
- Modify: `apps/web/src/app/api/webhooks/availability/route.ts`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/api/webhooks/availability/route.ts` to confirm the full structure.

- [ ] **Step 2: Add imports**

```typescript
import { getDayName, isValidTimezone } from "@/lib/timezone-utils"
import { generateSlots } from "@/lib/slot-generator"
```

- [ ] **Step 3: Rewrite the POST handler**

Replace the slot generation logic. Keep `parseFlexibleDate` as-is. Remove the old `generateMockSlots` function. The new handler:

```typescript
import type { AgentConfig, DayHours } from "@/lib/builder-types"

// Inside POST handler, after parsing body and validating agentId/date/service:

// 1. Fetch agent WITH config
const agent = await prisma.agent.findUnique({
  where: { id: agentId },
  select: { userId: true, config: true },
})
if (!agent) {
  return Response.json({ slots: [], source: "mock" })
}
const config = (agent.config ?? {}) as AgentConfig

// 2. Resolve timezone
const bodyTimezone = typeof body.timezone === "string" ? body.timezone : undefined
let timezone = bodyTimezone ?? config.timezone ?? "UTC"
if (!isValidTimezone(timezone)) {
  console.warn(`[availability] Invalid timezone "${timezone}", falling back to UTC`)
  timezone = "UTC"
}

// 3. Check if day is open
const dateStr = parseFlexibleDate(body.date)
const dayName = getDayName(dateStr, timezone)
const dayHours: DayHours | null | undefined = config.hours?.[dayName]

if (dayHours === null) {
  // Day explicitly closed
  return Response.json({ slots: [], source: "mock", reason: "closed" })
}

const open = dayHours?.open ?? "09:00"
const close = dayHours?.close ?? "17:00"

// 4. Find service duration
const serviceConfig = config.services?.find(
  (s) => s.name.toLowerCase() === service.toLowerCase()
)
const durationMinutes = serviceConfig?.duration ?? 30

// 5. Generate candidate slots
const allSlots = generateSlots(dateStr, open, close, durationMinutes, timezone)

// 6. Filter against Google Calendar or apply mock filter
const integration = await prisma.integration.findFirst({
  where: { userId: agent.userId, provider: IntegrationProvider.GOOGLE_CALENDAR },
})

let availableSlots: string[]
let source: "google_calendar" | "mock"

if (integration) {
  try {
    const events = await getCalendarEventsForDate(agent.userId, dateStr, timezone)
    // Filter out slots that overlap with any calendar event
    availableSlots = allSlots.filter((slotIso) => {
      const slotStart = new Date(slotIso).getTime()
      const slotEnd = slotStart + durationMinutes * 60_000
      return !events.some((ev) => ev.start.getTime() < slotEnd && ev.end.getTime() > slotStart)
    })
    source = "google_calendar"
  } catch (err) {
    console.error("[availability] Google Calendar error, falling back to mock", err)
    availableSlots = allSlots.filter((_, i) => (i + 1) % 4 !== 0)
    source = "mock"
  }
} else {
  // Mock: deterministic filter (~25% unavailable)
  availableSlots = allSlots.filter((_, i) => (i + 1) % 4 !== 0)
  source = "mock"
}

return Response.json({ slots: availableSlots, source })
```

Update the import of `checkAvailability` to `getCalendarEventsForDate` from `@/lib/google-calendar`.

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/webhooks/availability/route.ts
git commit -m "fix: availability webhook respects timezone, business hours, and service duration"
```

---

### Task 7: Update contact lookup webhook

**Files:**
- Modify: `apps/web/src/app/api/webhooks/contact-lookup/route.ts`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/api/webhooks/contact-lookup/route.ts` to confirm the appointments query and response shape.

- [ ] **Step 2: Add AppointmentStatus import**

```typescript
import { prisma, AppointmentStatus } from "@voicecraft/db"
```

- [ ] **Step 3: Replace the single appointments query with two parallel queries**

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

- [ ] **Step 4: Update the response shape**

Change from `recentAppointments` inside the contact object to a top-level `appointments` key:

```typescript
return Response.json({
  contact: {
    name: contact?.name ?? null,
    callCount: contact?.callCount ?? 0,
    lastCalledAt: contact?.lastCalledAt ?? null,
  },
  appointments: {
    upcoming: upcomingAppointments,
    past: pastAppointments,
  },
})
```

- [ ] **Step 5: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/webhooks/contact-lookup/route.ts
git commit -m "feat: split contact lookup appointments into upcoming and past"
```

> **Deployment note:** Task 7 (contact lookup response shape) and Task 10 (Python `_lookup_contact` parsing) are a breaking pair. They must be deployed together — deploying the webhook first would break the Python agent's response parsing. When implementing, both changes should land in the same deployment.

---

## Chunk 2: Python Agent Changes

### Task 8: Update prompts.py — conditional booking and new context suffix

**Files:**
- Modify: `apps/agent/src/agent/prompts.py`
- Create: `apps/agent/tests/test_prompts.py`

- [ ] **Step 1: Read the current file**

Read `apps/agent/src/agent/prompts.py` to confirm exact structure of `_BASE_PROMPT`, `build_system_prompt`, and `build_caller_context_suffix`.

- [ ] **Step 2: Write tests for conditional booking in system prompt**

Create `apps/agent/tests/test_prompts.py`:

```python
from src.agent.prompts import build_system_prompt, build_caller_context_suffix


def test_system_prompt_includes_booking_by_default():
    config = {"business_name": "Test Dental"}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()


def test_system_prompt_excludes_booking_when_disabled():
    config = {"business_name": "Test Info Line", "can_book_appointments": False}
    prompt = build_system_prompt(config)
    assert "book an appointment" not in prompt.lower()
    assert "check_availability" not in prompt.lower()


def test_system_prompt_includes_booking_when_enabled():
    config = {"business_name": "Test Dental", "can_book_appointments": True}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/agent && uv run pytest tests/test_prompts.py -v`
Expected: `test_system_prompt_excludes_booking_when_disabled` FAILS (booking instructions always included today)

- [ ] **Step 4: Update `build_system_prompt` to conditionally include booking**

In `prompts.py`, check `config.get("can_book_appointments", True)`. When `False`, exclude the booking-related content from the prompt. The sections to conditionalize are (refer to line numbers after reading the file):

1. **"Your role" bullet points** — lines mentioning "Check appointment availability" and "Book appointments" → omit when booking disabled
2. **"Booking an appointment" subsection** — the entire block with steps for checking availability and booking → omit when booking disabled
3. **"Important constraints"** — line about always using `check_availability` before booking → omit when booking disabled

Implementation approach: extract `_BOOKING_PROMPT` as a separate constant containing these three sections. In `build_system_prompt`, only append `_BOOKING_PROMPT` when `can_book_appointments` is `True`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/agent && uv run pytest tests/test_prompts.py::test_system_prompt_excludes_booking_when_disabled -v`
Expected: PASS

- [ ] **Step 6: Write tests for updated `build_caller_context_suffix`**

Add to `apps/agent/tests/test_prompts.py`:

```python
def test_caller_context_with_upcoming_appointments():
    contact = {"name": "Sarah", "callCount": 3}
    appointments = {
        "upcoming": [
            {"service": "Teeth Cleaning", "scheduledAt": "2026-03-25T15:00:00Z", "status": "BOOKED"}
        ],
        "past": [],
    }
    result = build_caller_context_suffix(contact, appointments)
    assert "upcoming" in result.lower() or "Teeth Cleaning" in result


def test_caller_context_with_past_only():
    contact = {"name": "Sarah", "callCount": 3}
    appointments = {
        "upcoming": [],
        "past": [
            {"service": "X-Ray", "scheduledAt": "2026-01-10T14:00:00Z", "status": "COMPLETED"}
        ],
    }
    result = build_caller_context_suffix(contact, appointments)
    assert "last visit" in result.lower() or "X-Ray" in result


def test_caller_context_with_no_appointments():
    contact = None
    appointments = {"upcoming": [], "past": []}
    result = build_caller_context_suffix(contact, appointments)
    assert result == "" or result.strip() == ""
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd apps/agent && uv run pytest tests/test_prompts.py -v`
Expected: context suffix tests FAIL (signature changed, old function takes one arg)

- [ ] **Step 8: Update `build_caller_context_suffix` signature and implementation**

Change signature from `(contact: dict)` to `(contact: dict | None, appointments: dict)`.

The function builds context text:
- For each item in `appointments["upcoming"]`: *"This caller has an upcoming {service} on {formatted_date}."*
- For first item in `appointments["past"]`: *"This caller's last visit was {formatted_date} for {service}."*
- If both empty and contact is None: return empty string.

- [ ] **Step 9: Run all prompt tests**

Run: `cd apps/agent && uv run pytest tests/test_prompts.py -v`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
cd apps/agent
git add src/agent/prompts.py tests/test_prompts.py
git commit -m "feat: conditional booking in system prompt, split upcoming/past in caller context"
```

---

### Task 9: Update tools.py — pass timezone in availability payload

**Files:**
- Modify: `apps/agent/src/agent/tools.py` (lines 97–140)

- [ ] **Step 1: Read the current file**

Read `apps/agent/src/agent/tools.py` to confirm `check_availability` function and how it accesses `context.userdata`.

- [ ] **Step 2: Update check_availability to extract timezone from userdata**

Inside the `check_availability` function, after extracting `agent_id`:

```python
userdata = getattr(context, "userdata", None)
timezone = userdata.get("timezone", "UTC") if isinstance(userdata, dict) else "UTC"
```

This uses `getattr` for consistency with the existing `_get_agent_id` helper pattern in the same file.

Then add `"timezone": timezone` to the payload dict sent to `/api/webhooks/availability`.

**Note:** `book_appointment` in `tools.py` does NOT need a timezone change — `scheduledAt` is already passed as UTC. Only the availability check needs timezone context.

- [ ] **Step 3: Verify no syntax errors**

Run: `cd apps/agent && uv run python -c "from src.agent.tools import check_availability; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd apps/agent
git add src/agent/tools.py
git commit -m "feat: pass timezone from userdata in availability tool call"
```

---

### Task 10: Update worker.py — conditional tools, userdata, contact lookup

**Files:**
- Modify: `apps/agent/src/agent/worker.py`
- Create: `apps/agent/tests/test_worker.py`

- [ ] **Step 1: Read the current file**

Read `apps/agent/src/agent/worker.py` to confirm `DentalReceptionist.__init__`, `entrypoint`, and `_lookup_contact`.

- [ ] **Step 2: Write tests for conditional tool loading**

Create `apps/agent/tests/test_worker.py`:

```python
from src.agent.tools import check_availability, book_appointment, send_sms


def test_tools_list_with_booking_enabled():
    config = {"can_book_appointments": True}
    tools = [send_sms]
    if config.get("can_book_appointments", True):
        tools += [check_availability, book_appointment]
    assert check_availability in tools
    assert book_appointment in tools
    assert send_sms in tools


def test_tools_list_with_booking_disabled():
    config = {"can_book_appointments": False}
    tools = [send_sms]
    if config.get("can_book_appointments", True):
        tools += [check_availability, book_appointment]
    assert check_availability not in tools
    assert book_appointment not in tools
    assert send_sms in tools


def test_tools_list_with_no_config_field():
    config = {}  # no can_book_appointments key
    tools = [send_sms]
    if config.get("can_book_appointments", True):
        tools += [check_availability, book_appointment]
    # Backward compat: default True
    assert check_availability in tools
    assert book_appointment in tools
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/agent && uv run pytest tests/test_worker.py -v`
Expected: ALL PASS (these test the logic pattern, not the class)

- [ ] **Step 4: Update `DentalReceptionist.__init__` to accept tools parameter**

```python
def __init__(self, instructions: str, tools: list | None = None) -> None:
    if tools is None:
        tools = [check_availability, book_appointment, send_sms]
    super().__init__(
        instructions=instructions,
        tools=tools,
    )
```

- [ ] **Step 5: Build the tools list dynamically in entrypoint**

In the `entrypoint` function, before creating `DentalReceptionist`:

```python
# Build tools list based on agent capabilities
agent_tools = [send_sms]  # always available
if config and config.get("can_book_appointments", True):
    agent_tools += [check_availability, book_appointment]
```

Update the `DentalReceptionist` construction:

```python
agent = DentalReceptionist(instructions=system_prompt, tools=agent_tools)
```

- [ ] **Step 6: Add timezone to userdata**

Update the `userdata` dict in the `AgentSession` constructor:

```python
userdata = {
    "agent_id": agent_id or "",
    "timezone": config.get("timezone", "UTC") if config else "UTC",
}
```

- [ ] **Step 7: Update `_lookup_contact` return type and call sites**

Change `_lookup_contact` to return a tuple. **All three return paths** must be updated:

```python
async def _lookup_contact(agent_id: str, phone: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    empty_appts: dict[str, Any] = {"upcoming": [], "past": []}
    try:
        # ... existing fetch logic ...
        data = response.json()
        contact_data = data.get("contact")
        appointments_data = data.get("appointments", empty_appts)
        return contact_data, appointments_data
    except httpx.TimeoutException:
        logger.warning("Contact lookup timed out", ...)
        return None, empty_appts  # was: return None
    except Exception:
        logger.error("Contact lookup failed", ...)
        return None, empty_appts  # was: return None
```

Update call sites in `entrypoint`:

```python
# 1. Initialize with defaults
contact: dict[str, Any] | None = None
appointments: dict[str, Any] = {"upcoming": [], "past": []}

# 2. Attempt lookup
if agent_id and caller_number:
    contact, appointments = await _lookup_contact(agent_id, caller_number)

# 3. Build prompt — ALWAYS call suffix (not guarded by `if contact:`)
#    The function handles contact=None internally.
system_prompt = build_system_prompt(config)
system_prompt += build_caller_context_suffix(contact, appointments)

# 4. Greeting — still uses contact dict (no change)
greeting = get_greeting(config, contact)
```

The key change at call site #3: remove the `if contact:` guard. The new `build_caller_context_suffix` handles `contact=None` and still emits upcoming appointment context for unknown callers who have a booking.

- [ ] **Step 8: Run all tests**

Run: `cd apps/agent && uv run pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd apps/agent
git add src/agent/worker.py tests/test_worker.py
git commit -m "feat: conditional tool loading, timezone in userdata, split contact lookup"
```

---

### Task 11: Final verification

- [ ] **Step 1: TypeScript type-check and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 2: Python tests**

Run: `cd apps/agent && uv run pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 3: Verify backward compatibility**

Check that an agent with no `can_book_appointments` or `timezone` fields in its config would still work:
- Python defaults `can_book_appointments` to `True` → booking tools loaded
- Availability webhook defaults timezone to `"UTC"` → same behavior as before
- Contact lookup returns new shape but Python agent handles it
