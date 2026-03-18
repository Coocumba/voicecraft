# Microsoft Outlook Calendar Integration — Design Spec

**Date:** 2026-03-18
**Status:** Approved for planning
**Scope:** Add Microsoft Outlook as a second calendar provider alongside Google Calendar. One provider at a time. Unified calendar interface so all callers (availability, booking, SMS bot) work with either provider transparently.

---

## Problem Statement

VoiceCraft only supports Google Calendar. Businesses using Microsoft Outlook / Office 365 (~25% of SMBs) can't sync appointments or check real availability. They're stuck with mock slots.

---

## Scope

### In scope

- Microsoft OAuth 2.0 flow (Azure AD / Microsoft identity platform)
- Microsoft Graph API integration (list events, create events, delete events)
- `MICROSOFT_OUTLOOK` provider enum value in Prisma
- Unified calendar abstraction (`calendar.ts`) so callers don't import provider-specific code
- UI updates: all "Connect Google Calendar" becomes a provider choice (Google or Outlook)
- Settings page: show connected provider, disconnect, switch
- Environment variables for Microsoft OAuth (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`)

### Out of scope

- Connecting both providers simultaneously (one at a time only)
- Apple Calendar / iCloud
- Zapier or unified PMS APIs
- Calendar event editing (only create and delete)

---

## 1. Database Changes

### 1.1 New enum value

Add `MICROSOFT_OUTLOOK` to `IntegrationProvider` in `packages/db/prisma/schema.prisma`:

```prisma
enum IntegrationProvider {
  GOOGLE_CALENDAR
  MICROSOFT_OUTLOOK
  TWILIO
}
```

The existing `Integration` model works as-is — `accessToken`, `refreshToken`, `expiresAt`, `metadata` (stores account email) are provider-agnostic.

### 1.2 Migration

```bash
npx prisma migrate dev --name add_microsoft_outlook_provider
```

### 1.3 Export

Add `MICROSOFT_OUTLOOK` to `IntegrationProvider` exports in `packages/db/src/index.ts` (already exported as part of the enum).

---

## 2. Microsoft OAuth Flow

### 2.1 Initiation route

**New file:** `apps/web/src/app/api/integrations/microsoft/route.ts`

**GET** — session authenticated

Mirrors the Google OAuth route pattern:

1. Generate CSRF state token (32 random bytes)
2. Read `returnTo` query param, validate starts with `/dashboard/`
3. Store JSON cookie: `{ csrf: state, returnTo }`
4. Redirect to Microsoft authorization endpoint:

```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize
  ?client_id={MICROSOFT_CLIENT_ID}
  &response_type=code
  &redirect_uri={APP_URL}/api/integrations/microsoft/callback
  &scope=Calendars.ReadWrite User.Read offline_access
  &state={state}
  &prompt=consent
```

**Required env vars:** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

Check availability: return 503 if either env var is missing.

### 2.2 Callback route

**New file:** `apps/web/src/app/api/integrations/microsoft/callback/route.ts`

**GET** — handles Microsoft's OAuth redirect

1. Validate CSRF state from cookie (same JSON pattern as Google)
2. Exchange authorization code for tokens:

```
POST https://login.microsoftonline.com/common/oauth2/v2.0/token
  client_id={MICROSOFT_CLIENT_ID}
  &client_secret={MICROSOFT_CLIENT_SECRET}
  &code={code}
  &redirect_uri={callback_url}
  &grant_type=authorization_code
```

3. Fetch user profile for email: `GET https://graph.microsoft.com/v1.0/me` (returns `mail` or `userPrincipalName`)
4. Upsert `Integration` record with `provider: MICROSOFT_OUTLOOK`, tokens, expiry, and email in metadata
5. Delete cookie
6. Redirect to `returnTo` (from cookie) or `/dashboard/settings?integration=success&provider=microsoft`

### 2.3 Disconnect route

**Reuse existing:** `apps/web/src/app/api/integrations/google/disconnect/route.ts`

Currently hardcoded to `GOOGLE_CALENDAR` provider. Generalize it to accept a `provider` query param or body field. Or create a separate `/api/integrations/microsoft/disconnect/route.ts` for symmetry.

**Recommendation:** Create a separate route for Microsoft (`/api/integrations/microsoft/disconnect`) that mirrors Google's. Keeps files simple and independent.

### 2.4 Status route

**New file:** `apps/web/src/app/api/integrations/microsoft/status/route.ts`

Same pattern as Google's status route: check env vars for `available`, check Integration record for `connected`, return email from metadata.

---

## 3. Microsoft Calendar Library

**New file:** `apps/web/src/lib/microsoft-calendar.ts`

Mirrors `google-calendar.ts` with identical exported function signatures so the unified abstraction can delegate transparently.

### 3.1 Token management

```typescript
export async function getValidAccessToken(userId: string): Promise<string>
```

Same pattern as Google: fetch Integration record, check expiry (5-min buffer), refresh if needed via Microsoft's token endpoint.

**Refresh endpoint:**
```
POST https://login.microsoftonline.com/common/oauth2/v2.0/token
  client_id, client_secret, refresh_token, grant_type=refresh_token, scope
```

### 3.2 List events for date

```typescript
export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone: string = "UTC"
): Promise<Array<{ start: Date; end: Date }>>
```

Uses Microsoft Graph Calendar View API:

```
GET https://graph.microsoft.com/v1.0/me/calendarView
  ?startDateTime={dayStart ISO}
  &endDateTime={dayEnd ISO}
  &$select=start,end,isCancelled
  &$top=50
```

Filters out cancelled events. Converts `start.dateTime` + `start.timeZone` to UTC Date objects.

Uses `toUTC` from `@/lib/timezone-utils` for day boundary computation (same as Google).

### 3.3 Book appointment (create event)

```typescript
export async function bookAppointment(
  userId: string,
  appointment: BookingDetails
): Promise<{ eventId: string }>
```

```
POST https://graph.microsoft.com/v1.0/me/events
Content-Type: application/json

{
  "subject": "{service} — {patientName}",
  "body": { "contentType": "text", "content": "Service: ...\nPhone: ..." },
  "start": { "dateTime": "...", "timeZone": "UTC" },
  "end": { "dateTime": "...", "timeZone": "UTC" }
}
```

Returns `{ eventId: response.id }`.

### 3.4 Delete calendar event

```typescript
export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void>
```

```
DELETE https://graph.microsoft.com/v1.0/me/events/{eventId}
```

Non-fatal — logs error but doesn't throw (same pattern as Google).

### 3.5 BookingDetails type

Export `BookingDetails` from `apps/web/src/lib/calendar.ts` (the unified abstraction). Both `google-calendar.ts` and `microsoft-calendar.ts` import it from there. The type is:

```typescript
export interface BookingDetails {
  patientName: string
  patientPhone?: string
  scheduledAt: string  // ISO 8601 datetime
  service: string
  durationMinutes?: number
}
```

Move the interface from `google-calendar.ts` to `calendar.ts` and re-export it. `google-calendar.ts` imports it from `calendar.ts`.

---

## 4. Unified Calendar Abstraction

**New file:** `apps/web/src/lib/calendar.ts`

A thin layer that checks which calendar provider the user has connected and delegates to the right implementation. All callers import from here instead of `google-calendar.ts` or `microsoft-calendar.ts` directly.

```typescript
import { prisma, IntegrationProvider } from "@voicecraft/db"
import * as google from "@/lib/google-calendar"
import * as microsoft from "@/lib/microsoft-calendar"

export type CalendarProvider = "google" | "microsoft" | null

export async function getConnectedProvider(userId: string): Promise<CalendarProvider> {
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
    },
    select: { provider: true },
  })
  if (!integration) return null
  return integration.provider === IntegrationProvider.GOOGLE_CALENDAR ? "google" : "microsoft"
}

export async function getCalendarEventsForDate(
  userId: string,
  date: string,
  timezone?: string
): Promise<Array<{ start: Date; end: Date }>> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") return google.getCalendarEventsForDate(userId, date, timezone)
  if (provider === "microsoft") return microsoft.getCalendarEventsForDate(userId, date, timezone)
  return []
}

export async function bookAppointment(
  userId: string,
  details: BookingDetails
): Promise<{ eventId: string } | null> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") return google.bookAppointment(userId, details)
  if (provider === "microsoft") return microsoft.bookAppointment(userId, details)
  return null
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const provider = await getConnectedProvider(userId)
  if (provider === "google") return google.deleteCalendarEvent(userId, eventId)
  if (provider === "microsoft") return microsoft.deleteCalendarEvent(userId, eventId)
}
```

### 4.1 Callers to update

Replace direct imports of `google-calendar.ts` functions with `calendar.ts` in:

| File | Current import | New import |
|------|---------------|------------|
| `apps/web/src/app/api/webhooks/availability/route.ts` | `getCalendarEventsForDate` from google-calendar | from `@/lib/calendar` |
| `apps/web/src/app/api/webhooks/book/route.ts` | `bookAppointment` from google-calendar | from `@/lib/calendar` |
| `apps/web/src/app/api/appointments/route.ts` | `bookAppointment` from google-calendar | from `@/lib/calendar` |
| `apps/web/src/app/api/appointments/[id]/route.ts` | `deleteCalendarEvent` from google-calendar | from `@/lib/calendar` |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | google-calendar imports | from `@/lib/calendar` |

The `getConnectedProvider` call adds one DB query per calendar operation. This is acceptable — the query is indexed and fast. Alternatively, cache the provider in the request context, but that's premature optimization.

---

## 5. UI Updates

### 5.1 Principle: provider-agnostic language

After connecting, all UI text says "your calendar" — not "Google Calendar" or "Outlook". The provider name only appears during connection choice and in the Settings page (to show which one is connected).

### 5.2 Calendar connection choice

Every place that currently has a "Connect Google Calendar" button gets replaced with a provider choice. This appears in:

1. **Connect-calendar interstitial** (`voice-agents/[id]/connect-calendar/page.tsx`)
2. **GuidedNextSteps** calendar step
3. **Agent detail page** warning banner
4. **Appointments dashboard** nudge banner
5. **Settings page** calendar section

The choice UI:

```
Connect your calendar

  [Google Calendar]     [Microsoft Outlook]
```

Two buttons side by side. Google links to `/api/integrations/google?returnTo=...`, Outlook links to `/api/integrations/microsoft?returnTo=...`.

**Component:** Extract a reusable `CalendarConnectButtons` component:

**New file:** `apps/web/src/components/integrations/CalendarConnectButtons.tsx`

```typescript
interface CalendarConnectButtonsProps {
  returnTo: string  // URL-encoded return path
}
```

Renders two buttons. Used by all five locations above.

### 5.3 Settings page — calendar section

Currently shows Google Calendar status only. Update to:

- If no calendar connected: show both connect buttons
- If Google connected: show "Google Calendar — Connected" with email + disconnect
- If Outlook connected: show "Microsoft Outlook — Connected" with email + disconnect

The status check queries both providers:

```typescript
const [googleStatus, microsoftStatus] = await Promise.all([
  fetch('/api/integrations/google/status'),
  fetch('/api/integrations/microsoft/status'),
])
```

### 5.4 Integration check updates

Every place that checks `IntegrationProvider.GOOGLE_CALENDAR` for calendar connection needs to check BOTH providers:

```typescript
// Before:
prisma.integration.findFirst({
  where: { userId, provider: IntegrationProvider.GOOGLE_CALENDAR },
})

// After:
prisma.integration.findFirst({
  where: {
    userId,
    provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
  },
})
```

**Files to update:**
- `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` (calendar warning banner)
- `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx` (interstitial skip logic)
- `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` (nudge banner)
- `apps/web/src/app/api/appointments/route.ts` (POST — calendar sync)

---

## 6. Environment Variables

Add to `.env.example`:

```
# Microsoft Outlook Calendar Integration (optional)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

**Azure AD app registration required:**
- Register app at https://portal.azure.com → Azure Active Directory → App registrations
- Set redirect URI to `{APP_URL}/api/integrations/microsoft/callback`
- Add API permissions: `Calendars.ReadWrite`, `User.Read`
- Generate client secret

---

## 7. File Summary

| File | Action |
|------|--------|
| `packages/db/prisma/schema.prisma` | Modify — add `MICROSOFT_OUTLOOK` to `IntegrationProvider` |
| `apps/web/src/app/api/integrations/microsoft/route.ts` | **New** — OAuth initiation |
| `apps/web/src/app/api/integrations/microsoft/callback/route.ts` | **New** — OAuth callback |
| `apps/web/src/app/api/integrations/microsoft/disconnect/route.ts` | **New** — Disconnect |
| `apps/web/src/app/api/integrations/microsoft/status/route.ts` | **New** — Connection status |
| `apps/web/src/lib/microsoft-calendar.ts` | **New** — Microsoft Graph calendar operations |
| `apps/web/src/lib/calendar.ts` | **New** — Unified calendar abstraction |
| `apps/web/src/components/integrations/CalendarConnectButtons.tsx` | **New** — Reusable provider choice buttons |
| `apps/web/src/app/api/webhooks/availability/route.ts` | Modify — import from `calendar.ts` |
| `apps/web/src/app/api/webhooks/book/route.ts` | Modify — import from `calendar.ts` |
| `apps/web/src/app/api/appointments/route.ts` | Modify — import from `calendar.ts` |
| `apps/web/src/app/api/appointments/[id]/route.ts` | Modify — import from `calendar.ts` |
| `apps/web/src/app/api/webhooks/twilio-sms/route.ts` | Modify — import from `calendar.ts` |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify — check both providers |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx` | Modify — show provider choice |
| `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` | Modify — check both providers |
| `apps/web/src/app/dashboard/(shell)/settings/page.tsx` | Modify — show both provider statuses |
| `apps/web/src/components/agents/GuidedNextSteps.tsx` | Modify — use CalendarConnectButtons |
| `apps/web/src/components/appointments/NewAppointmentDrawer.tsx` | Modify — "Google Calendar" → "your calendar" |
| `apps/web/src/components/appointments/AppointmentCard.tsx` | Modify — "Google Calendar" → "calendar" in sync indicator |
| `apps/web/src/app/page.tsx` | Modify — "Google Calendar Sync" → "Calendar Sync" with both providers mentioned |

---

## 8. Edge Cases

| Case | Behavior |
|------|----------|
| Owner connects Google, then tries to connect Outlook | The OAuth callback checks for any existing calendar integration and deletes it before creating the new one. This enforces one-at-a-time at the database level, not just the UI. The owner doesn't need to manually disconnect first — connecting a new provider automatically replaces the old one. |
| Owner disconnects and reconnects different provider | Old events stay in DB (calendarEventId from old provider). Deleting them would fail silently (non-fatal). New events use new provider. |
| Microsoft token expires and refresh fails | Same as Google — calendar operations fail silently, fall back to mock slots. Settings shows "Connected" but operations may fail. |
| `MICROSOFT_CLIENT_ID` not set | Microsoft option not shown in UI. Google-only behavior (same as today). |
| Both env vars missing (no Google, no Microsoft) | "Connect your calendar" shows "Coming soon" (existing behavior). |
| Owner's Outlook has no calendar | Graph API returns empty events list. Availability shows all slots as open. Same behavior as empty Google Calendar. |

---

## 9. Testing Approach

| Test | What to verify |
|------|----------------|
| Microsoft OAuth flow | Redirect, token exchange, Integration record created |
| Microsoft token refresh | Expired token → refresh → new token stored |
| Microsoft list events | Returns events within timezone-aware day boundaries |
| Microsoft create event | Event created with correct subject, body, times |
| Microsoft delete event | Event deleted, non-fatal on failure |
| Unified calendar — Google connected | Delegates to google-calendar functions |
| Unified calendar — Microsoft connected | Delegates to microsoft-calendar functions |
| Unified calendar — none connected | Returns empty/null gracefully |
| UI — both env vars set | Shows both Google and Outlook buttons |
| UI — only Google env vars | Shows only Google button |
| UI — provider connected | Shows connected status, disconnect option, no connect buttons |
| Integration check — both providers | All banner/warning queries find either provider |
