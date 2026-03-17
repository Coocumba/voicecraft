# Calendar Connection Flow + Manual Appointments — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Google Calendar connection at the right moments (interstitial after agent creation, GuidedNextSteps, persistent banner) and allow manual appointment creation from the appointments dashboard.

**Architecture:** Add a connect-calendar interstitial page, expand GuidedNextSteps with a calendar step, add persistent warning banners, create a NewAppointmentDrawer client component, and add a POST handler to the existing appointments API route. Thread `returnTo` through the Google OAuth flow so users land back where they came from.

**Tech Stack:** TypeScript, Next.js 16 App Router, Tailwind CSS, Prisma, Google Calendar API (existing `bookAppointment` function).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/api/integrations/google/route.ts` | Modify | Parse `returnTo` query param, store JSON cookie |
| `apps/web/src/app/api/integrations/google/callback/route.ts` | Modify | Parse JSON cookie, redirect to `returnTo` |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx` | Create | Interstitial page prompting calendar connection |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/loading.tsx` | Create | Loading skeleton |
| `apps/web/src/components/builder/BuilderChat.tsx` | Modify | Change post-generation redirect |
| `apps/web/src/components/agents/GuidedNextSteps.tsx` | Modify | Add `needsCalendar` prop and calendar step |
| `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx` | Modify | Integration check, warning banner, pass `needsCalendar` |
| `apps/web/src/app/dashboard/(shell)/appointments/page.tsx` | Modify | Integration check, nudge banner, fetch booking agents |
| `apps/web/src/components/appointments/AppointmentsClient.tsx` | Modify | "New Appointment" button, drawer trigger |
| `apps/web/src/components/appointments/NewAppointmentDrawer.tsx` | Create | Manual appointment creation drawer |
| `apps/web/src/app/api/appointments/route.ts` | Modify | Add POST handler |

---

## Chunk 1: OAuth returnTo + Interstitial + Builder Redirect

### Task 1: Add `returnTo` support to Google OAuth flow

**Files:**
- Modify: `apps/web/src/app/api/integrations/google/route.ts`
- Modify: `apps/web/src/app/api/integrations/google/callback/route.ts`

- [ ] **Step 1: Read both files**

Read `apps/web/src/app/api/integrations/google/route.ts` and `apps/web/src/app/api/integrations/google/callback/route.ts`.

- [ ] **Step 2: Update the OAuth initiation route**

In `route.ts`, before creating the state cookie:

```typescript
// Parse optional returnTo from query string
const { searchParams } = new URL(request.url)
const returnToParam = searchParams.get("returnTo")
// Validate: must start with /dashboard/ to prevent open redirect
const returnTo = returnToParam?.startsWith("/dashboard/") ? returnToParam : null
```

Change the `GET` function signature from `export async function GET()` to `export async function GET(request: Request)` to access the request URL.

Update the cookie value from plain `state` to JSON:

```typescript
const cookieValue = JSON.stringify({ csrf: state, returnTo })
cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, { /* same options */ })
```

- [ ] **Step 3: Update the OAuth callback route**

In `callback/route.ts`, update the state verification to parse JSON:

```typescript
// Before:
const storedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value
if (!storedState || storedState !== stateParam) { ... }

// After:
const cookieValue = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value
let storedCsrf: string | undefined
let returnTo: string | null = null
try {
  const parsed = JSON.parse(cookieValue ?? "")
  storedCsrf = parsed.csrf
  returnTo = typeof parsed.returnTo === "string" && parsed.returnTo.startsWith("/dashboard/")
    ? parsed.returnTo
    : null
} catch {
  storedCsrf = cookieValue  // backward compat: plain hex string
}
if (!storedCsrf || storedCsrf !== stateParam) { ... }
```

At the end of the callback, replace the hardcoded redirect:

```typescript
// Before:
redirect("/dashboard/settings?integration=success&provider=google")

// After:
const redirectUrl = returnTo
  ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}integration=success`
  : "/dashboard/settings?integration=success&provider=google"
redirect(redirectUrl)
```

- [ ] **Step 4: Verify types and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/integrations/google/route.ts apps/web/src/app/api/integrations/google/callback/route.ts
git commit -m "feat: add returnTo parameter to Google OAuth flow for contextual redirects"
```

---

### Task 2: Create connect-calendar interstitial page

**Files:**
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/page.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

Create `loading.tsx`:

```typescript
export default function ConnectCalendarLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-pulse">
      <div className="max-w-lg w-full text-center space-y-4">
        <div className="h-8 w-64 bg-border/50 rounded-lg mx-auto" />
        <div className="h-5 w-96 bg-border/50 rounded mx-auto" />
        <div className="h-10 w-48 bg-border/50 rounded-lg mx-auto mt-6" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the interstitial page**

Create `page.tsx` as a server component:

```typescript
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma, IntegrationProvider } from '@voicecraft/db'
import type { AgentConfig } from '@/lib/builder-types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ConnectCalendarPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const [agent, integration] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true, config: true },
    }),
    prisma.integration.findFirst({
      where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
      select: { id: true },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = (typeof agent.config === 'object' && agent.config !== null ? agent.config : {}) as AgentConfig

  // Skip interstitial if calendar already connected or agent doesn't book
  if (integration || config.can_book_appointments !== true) {
    redirect(`/dashboard/voice-agents/${id}?new=true`)
  }

  const returnTo = encodeURIComponent(`/dashboard/voice-agents/${id}?new=true`)

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-lg w-full text-center">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-3">Connect your calendar</h1>
        <p className="text-sm text-muted mb-8 max-w-md mx-auto">
          {agent.name} books appointments. Connect Google Calendar so it uses your real
          availability — otherwise it&apos;ll offer placeholder time slots that may conflict
          with your schedule.
        </p>
        <div className="space-y-3">
          <a
            href={`/api/integrations/google?returnTo=${returnTo}`}
            className="inline-flex bg-accent text-white px-6 py-2.5 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            Connect Google Calendar
          </a>
          <div>
            <Link
              href={`/dashboard/voice-agents/${id}?new=true`}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Skip for now →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS, new route visible in build output.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/voice-agents/[id]/connect-calendar/"
git commit -m "feat: add connect-calendar interstitial page for booking agents"
```

---

### Task 3: Update builder redirect

**Files:**
- Modify: `apps/web/src/components/builder/BuilderChat.tsx` (line ~202)

- [ ] **Step 1: Read the file**

Read `apps/web/src/components/builder/BuilderChat.tsx` and find the line with `router.push(...?new=true)`.

- [ ] **Step 2: Change the redirect**

```typescript
// Before:
router.push(`/dashboard/voice-agents/${data.agent.id}?new=true`)

// After:
router.push(`/dashboard/voice-agents/${data.agent.id}/connect-calendar`)
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/builder/BuilderChat.tsx
git commit -m "feat: redirect to connect-calendar interstitial after agent generation"
```

---

## Chunk 2: GuidedNextSteps + Warning Banners

### Task 4: Add calendar step to GuidedNextSteps

**Files:**
- Modify: `apps/web/src/components/agents/GuidedNextSteps.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/agents/GuidedNextSteps.tsx`.

- [ ] **Step 2: Add `needsCalendar` prop and calendar step**

Add `needsCalendar?: boolean` to `GuidedNextStepsProps`.

Update the description text from "Complete these two steps" to "Complete these steps" (dynamic count).

When `needsCalendar` is true, prepend a calendar step card before the existing Test and Number steps. The calendar step uses amber/warning styling:

```tsx
{needsCalendar && (
  <div className="bg-white rounded-xl border border-amber-300 p-5">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">1</span>
      <p className="font-medium text-ink">Connect Google Calendar</p>
    </div>
    <p className="text-sm text-muted mb-4 ml-7">
      Without this, your agent offers placeholder availability and patients may book conflicting times.
    </p>
    <div className="ml-7">
      <a
        href={`/api/integrations/google?returnTo=${encodeURIComponent(`/dashboard/voice-agents/${agentId}?new=true`)}`}
        className="inline-flex bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
      >
        Connect Google Calendar
      </a>
    </div>
  </div>
)}
```

Renumber existing steps: Test becomes 2 (or 1 if no calendar needed), Number becomes 3 (or 2).

Update the grid from `grid-cols-2` to handle 2 or 3 columns: use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` when `needsCalendar`, else keep `grid-cols-1 sm:grid-cols-2`.

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/agents/GuidedNextSteps.tsx
git commit -m "feat: add calendar connection step to GuidedNextSteps for booking agents"
```

---

### Task 5: Add calendar integration check and warning banner to agent detail page

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`.

- [ ] **Step 2: Add integration check to data fetch**

Add `IntegrationProvider` to the `@voicecraft/db` import.

Add to the `Promise.all` block:

```typescript
prisma.integration.findFirst({
  where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
  select: { id: true },
}),
```

Destructure the result alongside existing values.

- [ ] **Step 3: Compute `needsCalendar` and pass to GuidedNextSteps**

```typescript
const needsCalendar = config?.can_book_appointments === true && !hasGoogleCalendar
```

Pass `needsCalendar` prop to `<GuidedNextSteps>`.

- [ ] **Step 4: Add persistent warning banner**

Between the stats row and the phone number section, when `needsCalendar` is true:

```tsx
{needsCalendar && (
  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 mb-8">
    <span>Your agent offers placeholder availability because Google Calendar isn&apos;t connected.</span>
    <a
      href={`/api/integrations/google?returnTo=${encodeURIComponent(`/dashboard/voice-agents/${agent.id}`)}`}
      className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap ml-4"
    >
      Connect Google Calendar →
    </a>
  </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx"
git commit -m "feat: add calendar integration check and warning banner to agent detail page"
```

---

### Task 6: Add calendar nudge to appointments dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/appointments/page.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/dashboard/(shell)/appointments/page.tsx`.

- [ ] **Step 2: Add integration check and booking agents fetch**

Add `IntegrationProvider` to the `@voicecraft/db` import. Add `AgentConfig` type import.

Add to the data fetching:

```typescript
const [hasCalendarIntegration, allUserAgents] = await Promise.all([
  prisma.integration.findFirst({
    where: { userId, provider: IntegrationProvider.GOOGLE_CALENDAR },
    select: { id: true },
  }).then(Boolean),
  prisma.agent.findMany({
    where: { userId },
    select: { id: true, name: true, config: true },
  }),
])

const bookingAgents = allUserAgents.filter((a) => {
  const c = a.config as AgentConfig | null
  return c?.can_book_appointments === true
})

// Extract services from configs for the drawer
const bookingAgentsWithServices = bookingAgents.map((a) => ({
  id: a.id,
  name: a.name,
  services: ((a.config as AgentConfig | null)?.services ?? []).map((s) => s.name),
}))
```

- [ ] **Step 3: Add calendar nudge banner**

Between the stats row and the `AppointmentsClient`, when not connected:

```tsx
{!hasCalendarIntegration && (
  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-800 mb-6">
    <span>Connect Google Calendar to avoid double-bookings and sync appointments automatically.</span>
    <a
      href="/api/integrations/google?returnTo=%2Fdashboard%2Fappointments"
      className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap ml-4"
    >
      Connect Google Calendar →
    </a>
  </div>
)}
```

- [ ] **Step 4: Pass booking agents and calendar status to client**

Update the `AppointmentsClient` render:

```tsx
<AppointmentsClient
  appointments={serialized}
  agents={agents}
  bookingAgents={bookingAgentsWithServices}
  hasCalendarIntegration={hasCalendarIntegration}
/>
```

- [ ] **Step 5: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/dashboard/(shell)/appointments/page.tsx"
git commit -m "feat: add calendar nudge banner and pass booking agents to appointments dashboard"
```

---

## Chunk 3: Manual Appointment Creation

### Task 7: Create NewAppointmentDrawer component

**Files:**
- Create: `apps/web/src/components/appointments/NewAppointmentDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

A `'use client'` component. Props:

```typescript
interface BookingAgent {
  id: string
  name: string
  services: string[]
}

interface NewAppointmentDrawerProps {
  isOpen: boolean
  onClose: () => void
  bookingAgents: BookingAgent[]
  hasCalendarIntegration: boolean
  defaultAgentId?: string
}
```

The component renders a fixed right-side drawer with backdrop overlay:

- Backdrop: click to close, `bg-ink/20` overlay
- Drawer: `w-full max-w-md` from right side, white background
- Header: "New Appointment" + close button (X)
- Form fields: Agent dropdown, Service dropdown (populated from selected agent's services — if no services, show free-text input), Patient name, Patient phone, Date (defaults to today), Time
- Calendar sync notice: green if connected, muted warning if not (with "Connect now" link)
- Submit button: "Create Appointment" with loading state
- Close on Escape key

Submit flow:
1. Combine date + time into ISO string: `new Date(\`\${date}T\${time}\`).toISOString()`
2. POST to `/api/appointments`
3. Success → `toast.success("Appointment created")` + `onClose()` + `router.refresh()`
4. Error → `toast.error(message)`

- [ ] **Step 2: Verify types**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/appointments/NewAppointmentDrawer.tsx
git commit -m "feat: add NewAppointmentDrawer for manual appointment creation"
```

---

### Task 8: Wire up drawer in AppointmentsClient

**Files:**
- Modify: `apps/web/src/components/appointments/AppointmentsClient.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/appointments/AppointmentsClient.tsx`.

- [ ] **Step 2: Add new props and drawer state**

Add to the props interface:

```typescript
bookingAgents?: Array<{ id: string; name: string; services: string[] }>
hasCalendarIntegration?: boolean
```

Add state:

```typescript
const [drawerOpen, setDrawerOpen] = useState(false)
```

Import `NewAppointmentDrawer`.

- [ ] **Step 3: Add "New Appointment" button**

Add a button right-aligned in the filter bar area (before the status tabs):

```tsx
{bookingAgents && bookingAgents.length > 0 && (
  <button
    onClick={() => setDrawerOpen(true)}
    className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors ml-auto"
  >
    New Appointment
  </button>
)}
```

- [ ] **Step 4: Render the drawer**

At the end of the component return, before the closing `</div>`:

```tsx
{bookingAgents && bookingAgents.length > 0 && (
  <NewAppointmentDrawer
    isOpen={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    bookingAgents={bookingAgents}
    hasCalendarIntegration={hasCalendarIntegration ?? false}
    defaultAgentId={selectedAgentId !== 'all' ? selectedAgentId : undefined}
  />
)}
```

- [ ] **Step 5: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/appointments/AppointmentsClient.tsx
git commit -m "feat: add New Appointment button and drawer to appointments dashboard"
```

---

### Task 9: Add POST handler to appointments API

**Files:**
- Modify: `apps/web/src/app/api/appointments/route.ts`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/app/api/appointments/route.ts` to see existing GET handler and imports.

- [ ] **Step 2: Add POST handler**

Add imports for `IntegrationProvider`, `AppointmentStatus` (if not already), and `bookAppointment` from `@/lib/google-calendar`. Add `AgentConfig` type import.

```typescript
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

  const { agentId, service, patientName, patientPhone, scheduledAt } = body as Record<string, unknown>

  // Validate required fields
  if (typeof agentId !== "string" || !agentId.trim()) {
    return Response.json({ error: "agentId is required" }, { status: 400 })
  }
  if (typeof service !== "string" || !service.trim()) {
    return Response.json({ error: "service is required" }, { status: 400 })
  }
  if (typeof patientName !== "string" || !patientName.trim()) {
    return Response.json({ error: "patientName is required" }, { status: 400 })
  }
  if (typeof scheduledAt !== "string" || !scheduledAt.trim()) {
    return Response.json({ error: "scheduledAt is required" }, { status: 400 })
  }

  const scheduledDate = new Date(scheduledAt)
  if (isNaN(scheduledDate.getTime())) {
    return Response.json({ error: "scheduledAt must be a valid ISO datetime" }, { status: 400 })
  }
  if (scheduledDate <= new Date()) {
    return Response.json({ error: "Appointment must be in the future" }, { status: 400 })
  }

  try {
    // Verify agent ownership and booking capability
    const agent = await prisma.agent.findUnique({
      where: { id: agentId.trim() },
      select: { id: true, userId: true, config: true },
    })

    if (!agent || agent.userId !== session.user.id) {
      return Response.json({ error: "Agent not found" }, { status: 404 })
    }

    const agentConfig = (typeof agent.config === "object" && agent.config !== null ? agent.config : {}) as AgentConfig
    if (agentConfig.can_book_appointments !== true) {
      return Response.json(
        { error: "This agent is not configured for appointment booking" },
        { status: 403 }
      )
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        agentId: agent.id,
        patientName: patientName.trim(),
        patientPhone: typeof patientPhone === "string" && patientPhone.trim() ? patientPhone.trim() : null,
        scheduledAt: scheduledDate,
        service: service.trim(),
        status: AppointmentStatus.BOOKED,
      },
    })

    // Sync to Google Calendar (non-fatal)
    let calendarEventId: string | null = null
    try {
      const integration = await prisma.integration.findFirst({
        where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
        select: { id: true },
      })
      if (integration) {
        const result = await bookAppointment(session.user.id, {
          patientName: patientName.trim(),
          patientPhone: typeof patientPhone === "string" ? patientPhone.trim() : undefined,
          scheduledAt: scheduledDate.toISOString(),
          service: service.trim(),
          durationMinutes: agentConfig.services?.find(
            (s) => s.name.toLowerCase() === service.trim().toLowerCase()
          )?.duration,
        })
        calendarEventId = result.eventId
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { calendarEventId },
        })
      }
    } catch (err) {
      console.error("[POST /api/appointments] Google Calendar sync failed (non-fatal)", err)
    }

    return Response.json({ appointment: { ...appointment, calendarEventId } }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/appointments]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/appointments/route.ts
git commit -m "feat: add POST handler for manual appointment creation with calendar sync"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full type-check and build**

Run: `pnpm type-check && pnpm build`
Expected: PASS. Verify `connect-calendar` route appears in build output.

- [ ] **Step 2: Verify navigation flow**

Check the build output includes all expected routes:
- `/dashboard/voice-agents/[id]/connect-calendar`
- `/api/appointments` (POST handler)

- [ ] **Step 3: Commit any remaining changes**

If any files need cleanup, commit them.
