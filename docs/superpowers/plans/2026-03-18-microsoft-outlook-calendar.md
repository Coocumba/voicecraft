# Microsoft Outlook Calendar Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Microsoft Outlook as a second calendar provider alongside Google Calendar, with a unified abstraction so all callers work with either provider transparently.

**Architecture:** Add `MICROSOFT_OUTLOOK` to `IntegrationProvider` enum. Create `microsoft-calendar.ts` mirroring `google-calendar.ts` signatures but using Microsoft Graph API. Create `calendar.ts` as a unified abstraction that checks which provider is connected and delegates. Update all callers to import from `calendar.ts`. Update UI to show provider choice (Google or Outlook) everywhere calendar connection is offered.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma, Microsoft Graph API, Microsoft identity platform OAuth 2.0.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/prisma/schema.prisma` | Modify | Add `MICROSOFT_OUTLOOK` to enum |
| `apps/web/src/lib/calendar.ts` | Create | Unified calendar abstraction + `BookingDetails` type |
| `apps/web/src/lib/microsoft-calendar.ts` | Create | Microsoft Graph calendar operations |
| `apps/web/src/lib/google-calendar.ts` | Modify | Import `BookingDetails` from `calendar.ts` |
| `apps/web/src/app/api/integrations/microsoft/route.ts` | Create | OAuth initiation |
| `apps/web/src/app/api/integrations/microsoft/callback/route.ts` | Create | OAuth callback |
| `apps/web/src/app/api/integrations/microsoft/disconnect/route.ts` | Create | Disconnect |
| `apps/web/src/app/api/integrations/microsoft/status/route.ts` | Create | Status check |
| `apps/web/src/components/integrations/CalendarConnectButtons.tsx` | Create | Reusable provider choice |
| `apps/web/src/app/api/webhooks/availability/route.ts` | Modify | Import from `calendar.ts` |
| `apps/web/src/app/api/webhooks/book/route.ts` | Modify | Import from `calendar.ts` |
| `apps/web/src/app/api/appointments/route.ts` | Modify | Import from `calendar.ts` |
| `apps/web/src/app/api/appointments/[id]/route.ts` | Modify | Import from `calendar.ts` |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | Modify | Import from `calendar.ts` |
| `apps/web/src/app/dashboard/(shell)/settings/page.tsx` | Modify | Show both providers |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx` | Modify | Provider choice |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify | Check both providers |
| `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` | Modify | Check both providers |
| `apps/web/src/components/agents/GuidedNextSteps.tsx` | Modify | Use CalendarConnectButtons |
| `apps/web/src/components/appointments/NewAppointmentDrawer.tsx` | Modify | "Google Calendar" → "your calendar" |
| `apps/web/src/components/appointments/AppointmentCard.tsx` | Modify | "Google Calendar" → "calendar" |
| `apps/web/src/app/page.tsx` | Modify | "Google Calendar Sync" → "Calendar Sync" |

---

## Chunk 1: Schema + Unified Calendar Abstraction + Microsoft Library

### Task 1: Add MICROSOFT_OUTLOOK to IntegrationProvider enum

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Read the schema**

Read `packages/db/prisma/schema.prisma` and find the `IntegrationProvider` enum.

- [ ] **Step 2: Add the new enum value**

```prisma
enum IntegrationProvider {
  GOOGLE_CALENDAR
  MICROSOFT_OUTLOOK
  TWILIO
}
```

- [ ] **Step 3: Create migration and generate client**

```bash
cd packages/db && npx prisma migrate dev --name add_microsoft_outlook_provider
```

- [ ] **Step 4: Verify**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat: add MICROSOFT_OUTLOOK to IntegrationProvider enum"
```

---

### Task 2: Create unified calendar abstraction

**Files:**
- Create: `apps/web/src/lib/calendar.ts`
- Modify: `apps/web/src/lib/google-calendar.ts`

- [ ] **Step 1: Read google-calendar.ts**

Read `apps/web/src/lib/google-calendar.ts` to find the `BookingDetails` interface and all exported function signatures.

- [ ] **Step 2: Create calendar.ts**

Create `apps/web/src/lib/calendar.ts` with:
- `BookingDetails` interface (moved from google-calendar.ts)
- `CalendarProvider` type
- `getConnectedProvider(userId)` — queries Integration for either calendar provider
- `getCalendarEventsForDate(userId, date, timezone)` — delegates to correct provider
- `bookAppointment(userId, details)` — delegates to correct provider
- `deleteCalendarEvent(userId, eventId)` — delegates to correct provider

```typescript
import { prisma, IntegrationProvider } from "@voicecraft/db"

export interface BookingDetails {
  patientName: string
  patientPhone?: string
  scheduledAt: string
  service: string
  durationMinutes?: number
}

export type CalendarProvider = "google" | "microsoft" | null

const CALENDAR_PROVIDERS = [
  IntegrationProvider.GOOGLE_CALENDAR,
  IntegrationProvider.MICROSOFT_OUTLOOK,
]

export async function getConnectedProvider(userId: string): Promise<CalendarProvider> {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: { in: CALENDAR_PROVIDERS } },
    select: { provider: true },
  })
  if (!integration) return null
  return integration.provider === IntegrationProvider.GOOGLE_CALENDAR ? "google" : "microsoft"
}

export async function hasCalendarIntegration(userId: string): Promise<boolean> {
  const count = await prisma.integration.count({
    where: { userId, provider: { in: CALENDAR_PROVIDERS } },
  })
  return count > 0
}

export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.getCalendarEventsForDate(userId, date, timezone)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.getCalendarEventsForDate(userId, date, timezone)
  }
  return []
}

export async function bookAppointment(
  userId: string,
  details: BookingDetails
): Promise<{ eventId: string } | null> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.bookAppointment(userId, details)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.bookAppointment(userId, details)
  }
  return null
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") {
    const google = await import("@/lib/google-calendar")
    return google.deleteCalendarEvent(userId, eventId)
  }
  if (provider === "microsoft") {
    const microsoft = await import("@/lib/microsoft-calendar")
    return microsoft.deleteCalendarEvent(userId, eventId)
  }
}
```

Note: Uses dynamic `import()` so that microsoft-calendar.ts doesn't need to exist for the file to compile (it will be created in Task 3).

- [ ] **Step 3: Update google-calendar.ts**

Remove the `BookingDetails` interface from `google-calendar.ts` and import it from `calendar.ts`:

```typescript
import type { BookingDetails } from "@/lib/calendar"
```

Remove the `export` from the `BookingDetails` interface in google-calendar.ts (it now lives in calendar.ts). Keep re-exporting it if other files imported it directly:

```typescript
export type { BookingDetails } from "@/lib/calendar"
```

- [ ] **Step 4: Verify types**

Run: `pnpm type-check`
Expected: PASS (microsoft-calendar.ts doesn't exist yet but is only dynamically imported)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/calendar.ts apps/web/src/lib/google-calendar.ts
git commit -m "feat: create unified calendar abstraction with provider delegation"
```

---

### Task 3: Create Microsoft calendar library

**Files:**
- Create: `apps/web/src/lib/microsoft-calendar.ts`

- [ ] **Step 1: Create the library**

Mirror the Google calendar library's exported functions using Microsoft Graph API:

```typescript
import { prisma, IntegrationProvider } from "@voicecraft/db"
import { toUTC } from "@/lib/timezone-utils"
import type { BookingDetails } from "@/lib/calendar"

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface MicrosoftEvent {
  id: string
  subject?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  isCancelled?: boolean
}

interface MicrosoftEventsResponse {
  value?: MicrosoftEvent[]
}

interface MicrosoftCreatedEvent {
  id: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

async function refreshAccessToken(integrationId: string, refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "Calendars.ReadWrite User.Read offline_access",
  })

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as MicrosoftTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt,
    },
  })

  return data.access_token
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getValidAccessToken(userId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.MICROSOFT_OUTLOOK } },
  })

  if (!integration) {
    throw new Error(`No Microsoft Outlook integration found for user ${userId}`)
  }

  const bufferMs = 5 * 60 * 1000
  const isExpired =
    integration.expiresAt !== null &&
    integration.expiresAt.getTime() - bufferMs < Date.now()

  if (!isExpired) return integration.accessToken

  if (!integration.refreshToken) {
    throw new Error("Microsoft Outlook token is expired and no refresh token is available")
  }

  return refreshAccessToken(integration.id, integration.refreshToken)
}

export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>> {
  const accessToken = await getValidAccessToken(userId)

  const dayStart = toUTC(`${date}T00:00:00`, timezone)
  const dayEnd = toUTC(`${date}T00:00:00`, timezone, 1)

  const params = new URLSearchParams({
    startDateTime: dayStart.toISOString(),
    endDateTime: dayEnd.toISOString(),
    $select: "start,end,isCancelled",
    $top: "50",
  })

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft Calendar events fetch failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as MicrosoftEventsResponse
  const events = data.value ?? []

  const intervals: Array<{ start: Date; end: Date }> = []
  for (const event of events) {
    if (event.isCancelled) continue
    const start = new Date(event.start.dateTime + "Z")
    const end = new Date(event.end.dateTime + "Z")
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      intervals.push({ start, end })
    }
  }

  return intervals
}

export async function bookAppointment(
  userId: string,
  appointment: BookingDetails
): Promise<{ eventId: string }> {
  const accessToken = await getValidAccessToken(userId)

  const durationMs = (appointment.durationMinutes ?? 30) * 60 * 1000
  const startTime = new Date(appointment.scheduledAt)
  const endTime = new Date(startTime.getTime() + durationMs)

  const descriptionParts = [`Service: ${appointment.service}`]
  if (appointment.patientPhone) {
    descriptionParts.push(`Phone: ${appointment.patientPhone}`)
  }

  const eventBody = {
    subject: `${appointment.service} — ${appointment.patientName}`,
    body: { contentType: "text", content: descriptionParts.join("\n") },
    start: { dateTime: startTime.toISOString(), timeZone: "UTC" },
    end: { dateTime: endTime.toISOString(), timeZone: "UTC" },
  }

  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft Calendar event creation failed (${res.status}): ${text}`)
  }

  const created = (await res.json()) as MicrosoftCreatedEvent
  return { eventId: created.id }
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  try {
    const accessToken = await getValidAccessToken(userId)

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok && res.status !== 404) {
      const text = await res.text()
      console.error(`[deleteCalendarEvent] Microsoft Calendar DELETE failed (${res.status}): ${text}`)
    }
  } catch (err) {
    console.error("[deleteCalendarEvent] Error deleting Microsoft calendar event", err)
  }
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/microsoft-calendar.ts
git commit -m "feat: add Microsoft Graph calendar library (list, create, delete events)"
```

---

### Task 4: Update all callers to import from calendar.ts

**Files to modify:**
- `apps/web/src/app/api/webhooks/availability/route.ts`
- `apps/web/src/app/api/webhooks/book/route.ts`
- `apps/web/src/app/api/appointments/route.ts`
- `apps/web/src/app/api/appointments/[id]/route.ts`
- `apps/web/src/app/api/webhooks/twilio-sms/route.ts`

- [ ] **Step 1: Read each file and update imports**

For each file:
1. Replace `import { ... } from "@/lib/google-calendar"` with `import { ... } from "@/lib/calendar"`
2. Replace any `IntegrationProvider.GOOGLE_CALENDAR` checks with `{ in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] }` — or better, use the `hasCalendarIntegration(userId)` helper from `calendar.ts` to avoid importing both enum values
3. If the file imports `BookingDetails`, change the import source to `@/lib/calendar`

The function signatures (`getCalendarEventsForDate`, `bookAppointment`, `deleteCalendarEvent`) are identical in `calendar.ts` so no call site changes are needed beyond the imports and provider checks.

- [ ] **Step 2: Verify types and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/
git commit -m "refactor: update all calendar callers to use unified calendar abstraction"
```

---

## Chunk 2: Microsoft OAuth Routes

### Task 5: Microsoft OAuth initiation route

**Files:**
- Create: `apps/web/src/app/api/integrations/microsoft/route.ts`

- [ ] **Step 1: Read the Google OAuth route for pattern**

Read `apps/web/src/app/api/integrations/google/route.ts`.

- [ ] **Step 2: Create the Microsoft OAuth route**

Mirror the Google route with Microsoft endpoints:

- Cookie name: `microsoft_oauth_state`
- Env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- Auth URL: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- Scopes: `Calendars.ReadWrite User.Read offline_access`
- Redirect URI: `${appUrl}/api/integrations/microsoft/callback`
- Same `returnTo` handling (JSON cookie with CSRF)
- Same 503 if env vars missing

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/integrations/microsoft/route.ts
git commit -m "feat: add Microsoft OAuth initiation route"
```

---

### Task 6: Microsoft OAuth callback route

**Files:**
- Create: `apps/web/src/app/api/integrations/microsoft/callback/route.ts`

- [ ] **Step 1: Read the Google callback route for pattern**

Read `apps/web/src/app/api/integrations/google/callback/route.ts`.

- [ ] **Step 2: Create the Microsoft callback route**

Mirror the Google callback with Microsoft endpoints:

- Token endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- User info: `GET https://graph.microsoft.com/v1.0/me` → use `mail` or `userPrincipalName` for email
- Upsert `Integration` with `provider: IntegrationProvider.MICROSOFT_OUTLOOK`
- **Important (from spec):** Before upserting, delete any existing calendar integration (Google or Microsoft) to enforce one-at-a-time:

```typescript
// Delete any existing calendar integration before creating new one
await prisma.integration.deleteMany({
  where: {
    userId,
    provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
  },
})
```

Then create the new Integration record.

- Same `returnTo` redirect handling from cookie
- Fallback redirect: `/dashboard/settings?integration=success&provider=microsoft`

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/integrations/microsoft/callback/route.ts
git commit -m "feat: add Microsoft OAuth callback with one-at-a-time enforcement"
```

---

### Task 7: Microsoft disconnect and status routes

**Files:**
- Create: `apps/web/src/app/api/integrations/microsoft/disconnect/route.ts`
- Create: `apps/web/src/app/api/integrations/microsoft/status/route.ts`

- [ ] **Step 1: Read the Google routes for pattern**

Read disconnect and status routes from Google.

- [ ] **Step 2: Create Microsoft disconnect route**

Mirror Google disconnect but with `IntegrationProvider.MICROSOFT_OUTLOOK`.

- [ ] **Step 3: Create Microsoft status route**

Mirror Google status but:
- Check `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` for availability
- Use `IntegrationProvider.MICROSOFT_OUTLOOK` for lookup

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/integrations/microsoft/
git commit -m "feat: add Microsoft disconnect and status routes"
```

---

## Chunk 3: UI Updates

### Task 8: Create CalendarConnectButtons component

**Files:**
- Create: `apps/web/src/components/integrations/CalendarConnectButtons.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

interface CalendarConnectButtonsProps {
  returnTo: string // URL path to return to after OAuth (will be encoded)
  googleAvailable?: boolean
  microsoftAvailable?: boolean
}

export function CalendarConnectButtons({
  returnTo,
  googleAvailable = true,
  microsoftAvailable = true,
}: CalendarConnectButtonsProps) {
  const encoded = encodeURIComponent(returnTo)

  if (!googleAvailable && !microsoftAvailable) return null

  return (
    <div className="flex flex-wrap gap-2">
      {googleAvailable && (
        <a
          href={`/api/integrations/google?returnTo=${encoded}`}
          className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium text-ink hover:bg-cream transition-colors"
        >
          Google Calendar
        </a>
      )}
      {microsoftAvailable && (
        <a
          href={`/api/integrations/microsoft?returnTo=${encoded}`}
          className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium text-ink hover:bg-cream transition-colors"
        >
          Microsoft Outlook
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/integrations/CalendarConnectButtons.tsx
git commit -m "feat: add CalendarConnectButtons component for provider choice"
```

---

### Task 9: Update connect-calendar interstitial and GuidedNextSteps

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx`
- Modify: `apps/web/src/components/agents/GuidedNextSteps.tsx`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Update connect-calendar interstitial**

1. Change the integration check from `IntegrationProvider.GOOGLE_CALENDAR` to `{ in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] }`
2. Replace the single "Connect Google Calendar" button with `CalendarConnectButtons`:

```tsx
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

// Replace the <a href="/api/integrations/google..."> with:
<CalendarConnectButtons returnTo={`/dashboard/voice-agents/${id}?new=true`} />
```

3. Update heading from "Connect your calendar" (already generic — good)

- [ ] **Step 3: Update GuidedNextSteps calendar step**

Replace the single "Connect Calendar" button with `CalendarConnectButtons`:

```tsx
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

// In the calendar step, replace the <a href> button with:
<CalendarConnectButtons returnTo={`/dashboard/voice-agents/${agentId}?new=true`} />
```

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx" apps/web/src/components/agents/GuidedNextSteps.tsx
git commit -m "feat: show Google and Outlook options in calendar connection flows"
```

---

### Task 10: Update agent detail page and appointments page provider checks

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/(shell)/appointments/page.tsx`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Update agent detail page**

Change the Google Calendar integration check in `Promise.all` from:
```typescript
prisma.integration.findFirst({
  where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
})
```
To:
```typescript
prisma.integration.findFirst({
  where: {
    userId: session.user.id,
    provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
  },
})
```

Update the warning banner's "Connect Google Calendar" link to use `CalendarConnectButtons`:
```tsx
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

// In the amber warning banner, replace the <a> link with:
<CalendarConnectButtons returnTo={`/dashboard/voice-agents/${agent.id}`} />
```

- [ ] **Step 3: Update appointments page**

Same provider check update. Same `CalendarConnectButtons` in the nudge banner.

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx" "apps/web/src/app/dashboard/(shell)/appointments/page.tsx"
git commit -m "feat: check both calendar providers in agent detail and appointments pages"
```

---

### Task 11: Update Settings page for both providers

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/settings/page.tsx`

- [ ] **Step 1: Read the current file**

Read the Settings page, focusing on the `GoogleCalendarSection` component.

- [ ] **Step 2: Generalize the calendar section**

Rename `GoogleCalendarSection` to `CalendarSection`. Fetch status from both providers:

```typescript
const [googleRes, microsoftRes] = await Promise.all([
  fetch('/api/integrations/google/status').then(r => r.json()).catch(() => ({ available: false, connected: false })),
  fetch('/api/integrations/microsoft/status').then(r => r.json()).catch(() => ({ available: false, connected: false })),
])
```

Display logic:
- If Google connected: show "Google Calendar — Connected" with email + disconnect
- If Microsoft connected: show "Microsoft Outlook — Connected" with email + disconnect
- If neither connected: show `CalendarConnectButtons` with both options (only show available ones)

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/settings/page.tsx"
git commit -m "feat: show both Google and Outlook options in Settings calendar section"
```

---

### Task 12: Update hardcoded "Google Calendar" strings

**Files:**
- Modify: `apps/web/src/components/appointments/NewAppointmentDrawer.tsx`
- Modify: `apps/web/src/components/appointments/AppointmentCard.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Update NewAppointmentDrawer**

Change:
- "This appointment will be synced to Google Calendar." → "This appointment will be synced to your calendar."
- "This appointment won't sync to Google Calendar." → "This appointment won't sync to your calendar."

- [ ] **Step 2: Update AppointmentCard**

Change:
- `title="Synced to Google Calendar"` → `title="Synced to calendar"`
- `aria-label="Synced to Google Calendar"` → `aria-label="Synced to calendar"`

- [ ] **Step 3: Update landing page**

Change:
- `title: "Google Calendar Sync"` → `title: "Calendar Sync"`
- Description: mention "Google or Microsoft calendar"

- [ ] **Step 4: Verify build**

Run: `pnpm type-check && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/appointments/ apps/web/src/app/page.tsx
git commit -m "fix: use provider-agnostic calendar language throughout UI"
```

---

### Task 13: Update .env.example and final verification

- [ ] **Step 1: Add Microsoft env vars to .env.example**

```
# Microsoft Outlook Calendar Integration (optional)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

- [ ] **Step 2: Full type-check and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS. Verify these routes in output:
- `/api/integrations/microsoft`
- `/api/integrations/microsoft/callback`
- `/api/integrations/microsoft/disconnect`
- `/api/integrations/microsoft/status`

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add Microsoft OAuth env vars to .env.example"
```
