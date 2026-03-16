# VoiceCraft Dashboard Redesign — Design Spec

**Date:** 2026-03-15
**Status:** Approved for implementation
**Scope:** Full dashboard redesign — navigation, home screen, Voice Agents service, agent creation flow, post-creation guidance, agent detail

---

## 1. Context & Goals

### Product Structure

```
Company X (future parent)
  └── VoiceCraft (product — current codebase)
        └── Voice Agents   ← first service, building now
        └── SMS Bot        ← future
        └── Chat Widget    ← future
```

VoiceCraft is a platform. Users log in once and access all services. Each service has its own AI-First creation flow. The dashboard must be designed to accommodate new services without structural changes.

### Design Goals

- **AI-First:** The AI is the primary interface for creation. No forms, no dropdowns, no decisions — just conversation.
- **Simple:** Every screen has one clear purpose and one clear next action. No confusion.
- **Platform-aware:** Navigation and home screen support multiple services naturally.
- **Works for any business type:** The agent creator adapts to whatever business the user describes.
- **Familiar to non-technical SMB users:** Warm, approachable, not a developer tool.

---

## 2. Design System

No changes to the existing system. All new components use existing tokens.

### Existing Tokens (unchanged)

| Token | Value | Usage |
|---|---|---|
| `bg-cream` | 247 244 238 | Page background |
| `bg-white` | 255 255 255 | Card surfaces |
| `text-ink` | 26 24 20 | Primary text |
| `text-muted` | 122 117 108 | Secondary / disabled |
| `border-border` | 226 221 213 | Borders |
| `text-accent / bg-accent` | violet 109 70 220 | CTAs, active states |
| `text-success` | 45 106 79 | Active/live status |
| `font-serif` | Lora | Headings |
| `font-sans` | Source Sans 3 | Body |
| `rounded-xl` | 12px | Cards |

### New Components (use existing tokens)

**TopBar** (`src/components/layout/TopBar.tsx`)
`bg-white border-b border-border h-14`. Logo in `text-ink`, service nav items in `text-muted` with `text-ink` on hover, active service in `text-accent font-medium`. Coming-soon items: `text-muted opacity-50 cursor-not-allowed` with a `"Soon"` badge (`text-xs`). User avatar + dropdown (name + sign out) far right. Settings icon before avatar. On mobile: hamburger icon opens a full-width dropdown drawer below the bar showing all service links stacked vertically.

**ProgressDots** (`src/components/ui/ProgressDots.tsx`)
Props: `total: number, current: number`. Completed step: `bg-accent w-2 h-2 rounded-full`. Remaining: `border border-border bg-transparent w-2 h-2 rounded-full`. Displayed as a flex row with `gap-1.5`.

**ServiceCard** (`src/components/ui/ServiceCard.tsx`)
`bg-white rounded-xl border border-border p-6`. Active: full opacity, includes CTA button (`bg-accent text-white`). Coming-soon: `opacity-50 pointer-events-none`, no button, shows `text-xs text-muted` label "Coming soon".

**GuidedNextSteps** (`src/components/ui/GuidedNextSteps.tsx`)
Client component. Two side-by-side cards. Test card (primary until tested): `bg-accent text-white` button. Deploy card (secondary until tested, then primary): `bg-white border border-border text-ink` button. After test completes, Deploy card button switches to `bg-accent text-white`.

**AI chat bubbles (refined — update `ChatMessage.tsx`)**
- AI message: `bg-cream rounded-2xl rounded-bl-md px-4 py-3 text-sm text-ink`. First sentence wrapped in `<span className="font-serif">`.
- User message: `bg-accent/10 text-ink rounded-2xl rounded-br-md px-4 py-3 text-sm`. Right-aligned.
- Keep existing typing indicator.

**InlineSummaryCard** (`src/components/builder/InlineSummaryCard.tsx`)
Props: `config: AgentConfig`. `bg-white rounded-xl border border-border p-4 my-3 space-y-1 text-sm text-ink`. Each field as a `flex justify-between` row with `text-muted` label and `text-ink` value.

---

## 3. Route Structure & Layout Strategy

### Route rename

The existing `/dashboard/agents/...` routes are renamed to `/dashboard/voice-agents/...`. Add redirects in `next.config.ts`:

```ts
async redirects() {
  return [
    { source: '/dashboard/agents', destination: '/dashboard/voice-agents', permanent: true },
    { source: '/dashboard/agents/:path*', destination: '/dashboard/voice-agents/:path*', permanent: true },
  ]
}
```

Also update all internal `router.push` and `<Link href>` references from `/dashboard/agents` to `/dashboard/voice-agents`.

### Route groups for layout control

Use Next.js App Router route groups to control which routes show the TopBar:

```
src/app/dashboard/
  layout.tsx                    ← minimal wrapper (bg-cream, auth check only)
  (shell)/
    layout.tsx                  ← adds TopBar
    page.tsx                    ← VoiceCraft home
    voice-agents/
      page.tsx                  ← agent list OR empty-state onboarding
      [id]/
        page.tsx                ← agent detail
        test/
          page.tsx              ← test call
    settings/
      page.tsx
  (focused)/
    layout.tsx                  ← no TopBar, just a back-link bar
    voice-agents/
      new/
        page.tsx                ← AI creation flow
```

`(shell)/layout.tsx` renders `<TopBar />` above `{children}`.
`(focused)/layout.tsx` renders only a slim top strip with a back link and `<ProgressDots />`, then `{children}`. The back link label and destination are passed from the page via a layout metadata convention — for now, Voice Agents creation always shows `← Voice Agents` linking to `/dashboard/voice-agents`. When new service creation flows are added, each page passes its own label. Hardcoding in the layout is not acceptable; use a `searchParams`-driven or layout-slot pattern.

### All routes

| Route | Group | Description |
|---|---|---|
| `/dashboard` | `(shell)` | VoiceCraft home — service cards |
| `/dashboard/voice-agents` | `(shell)` | Agent list or empty-state onboarding |
| `/dashboard/voice-agents/new` | `(focused)` | AI creation flow |
| `/dashboard/voice-agents/[id]` | `(shell)` | Agent detail |
| `/dashboard/voice-agents/[id]/test` | `(shell)` | Test call |
| `/dashboard/settings` | `(shell)` | Settings |

---

## 4. Screen: VoiceCraft Home (`/dashboard`)

### First visit (no services used yet)

```
Good morning, [Name]

What would you like to set up today?

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  🎙 Voice Agents    │  │  💬 SMS Bot          │  │  🪟 Chat Widget     │
│  Handle calls       │  │  Coming soon         │  │  Coming soon        │
│  automatically      │  │                      │  │                     │
│  [ Get started ]    │  │                      │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

- Greeting: `font-serif text-2xl text-ink`
- Cards: `ServiceCard` component, `grid grid-cols-1 md:grid-cols-3 gap-4`
- On mobile (single column): cards stack vertically

### Returning visit (has agents)

Same layout. Voice Agents card shows: `text-sm text-muted` summary of active agent count and call count this week. CTA changes to `[ Open ]`.

---

## 5. Screen: Voice Agents — Empty State (`/dashboard/voice-agents`)

Shown when the authenticated user has zero agents. The `(shell)` layout renders the TopBar, but the page itself hides the standard content padding and goes full-viewport for the AI prompt.

```
[TopBar visible above]

        Tell me about your business

  [ A dental clinic, a bakery, a gym…          ] →

  ──────────────────────────────────────────────────
  Try:  Dental clinic  ·  Hair salon  ·  Law firm
        Bakery  ·  Gym  ·  Plumbing company
```

- Centered vertically within remaining viewport below TopBar: `flex-1 flex flex-col items-center justify-center`
- Heading: `font-serif text-3xl text-ink mb-6`
- Input: `px-5 py-4 rounded-xl border border-border bg-white text-ink text-base w-full max-w-xl focus:ring-2 focus:ring-accent outline-none`
- Submit: pressing Enter or clicking `→` button navigates to:
  `/dashboard/voice-agents/new?business=<url-encoded-description>`
- Example prompts: `text-sm text-muted mt-4 flex flex-wrap gap-2 justify-center`. Each prompt is a `<button>` that populates the input.
- Background: `bg-cream min-h-screen`

---

## 6. Screen: Agent Creation Flow (`/dashboard/voice-agents/new`)

**Layout:** `(focused)` group — no TopBar. Slim focused bar at top: `← Voice Agents` (left) + `<ProgressDots total={5} current={n} />` (right).

### Context passing

The page receives `searchParams.business` (the business description from the empty state). This is passed as `initialMessage` prop to `BuilderChat`. On mount, `BuilderChat` sends this as the first user message automatically (without showing it in the input box) to kick off the conversation.

If `searchParams.business` is absent (user navigated directly to `/new`), `BuilderChat` shows the existing opening greeting and waits for input.

### BuilderChat changes (code changes — not just prompt)

**Remove:** The `exchangeCount >= 4` gate and "Generate Configuration" button.
**Remove:** The `ConfigPreview` side panel and mobile toggle.
**Add:** `initialMessage?: string` prop. On mount, if present, auto-send as first user message.
**Add:** AI detects readiness server-side (builder API returns `ready: true` flag when it has enough context).
**Add:** When `ready: true` is received, render `InlineSummaryCard` + "Create Agent" button inside the message stream.
**Add:** `ProgressDots` count advances based on topics covered (tracked as part of API response: `topicsCovered: number`). The five topics in order are: (1) business type & name, (2) business hours, (3) services offered, (4) agent tone & greeting, (5) escalation / after-hours handling. The builder API increments `topicsCovered` as each topic is resolved in the conversation.

### Chat layout

```
[← Voice Agents  /dashboard/voice-agents]                ●●●○○

┌──────────────────────────────────────────────────┐
│  AI:  Great — a dental clinic. Do you offer      │
│       emergency appointments or only scheduled?  │
│                                                  │
│                  You:  Both, prefer scheduled.   │
│                                                  │
│  AI:  Got it. What are your business hours?      │
│                                                  │
│  [typing indicator]                              │
└──────────────────────────────────────────────────┘

[ Type a message…                              Send ]
```

- Full viewport height below focused bar: `flex flex-col h-[calc(100vh-56px)]`
- Messages area: `flex-1 overflow-y-auto p-5 flex flex-col gap-4`
- Input area: same as current but `rounded-xl` and full width (no side panel)

### Completion state (inline, in message stream)

```
  AI:  I have everything I need. Here's what I'll set up:

       ┌─────────────────────────────────────┐
       │  Business     Smile Dental           │
       │  Hours        Mon–Fri 9am–6pm       │
       │  Tone         Friendly & professional│
       │  Greeting     "Thank you for…"      │
       │  Services     Cleanings, fillings…  │
       │  After-hours  Take a message         │
       └─────────────────────────────────────┘

                   [ Create Agent ]
```

- "Create Agent" calls `POST /api/agents` with the generated config
- On success: `router.push('/dashboard/voice-agents/<id>?new=true')`
- Input area is disabled once the summary appears (same `opacity-50 pointer-events-none` pattern)

---

## 7. Screen: Post-Creation Guided Next Steps

**Route:** `/dashboard/voice-agents/[id]?new=true`

The `?new=true` query param triggers `GuidedNextSteps` to render above the standard agent detail content. On mount, the component receives the agent `id` as a prop and calls `router.replace(\`/dashboard/voice-agents/${id}\`)` (strips the query param from the URL) but keeps the guided UI visible in local state until the user clicks either card action. This means refreshing the page will not re-show the guided steps — intentional.

```
  ✓ Smile Dental is ready

  Here's what to do next:

  ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
  │  🔊 Test your agent              │   │  🚀 Deploy to a phone number     │
  │                                  │   │                                  │
  │  Hear exactly how it sounds      │   │  Go live and start handling      │
  │  before going live.              │   │  real calls.                     │
  │                                  │   │                                  │
  │  [ Start test call ]  ← primary  │   │  [ Set phone number ] ← secondary│
  └──────────────────────────────────┘   └──────────────────────────────────┘

  We recommend testing first.
```

- Success heading: `font-serif text-2xl text-ink`
- Checkmark: `text-success` with `✓` icon
- Hint: `text-xs text-muted mt-3`
- After test call returns to this agent's detail page, the Deploy card becomes primary

---

## 8. Screen: Test Call (`/dashboard/voice-agents/[id]/test`)

Minimal. `TestCallClient` restyled. No logic changes.

```
  Testing: Smile Dental

  ─────────────────────────────────────────────────
  Your agent will answer as if a real customer
  called. Say anything to test it.
  ─────────────────────────────────────────────────

  [ 🎙 Start Call ]


  After the call ends:

  [ 👍 Looks good — Deploy it ]   [ 💬 Something needs changing ]
```

**"Something needs changing"** navigates to:
`/dashboard/voice-agents/new?conversationId=<conversationId>&agentId=<agentId>&edit=true`

`BuilderChat` reads `searchParams.conversationId`, `searchParams.agentId`, and `searchParams.edit`. When `edit=true`, it restores the existing conversation (using the stored `conversationId`) and sends an automatic first message: *"I'd like to change something about my agent."* The user continues from where the conversation left off — all prior context is preserved.

**Edit mode "Create Agent" behaviour:** When `edit=true`, the "Create Agent" button calls `PATCH /api/agents/[agentId]` with the new generated config — it updates the existing agent record, it does NOT create a new one. The builder generate endpoint must be called first to produce the updated config, then the agent is patched. The user is returned to `/dashboard/voice-agents/[agentId]` after a successful patch.

**"Looks good — Deploy it"** navigates to `/dashboard/voice-agents/[id]` (the standard detail page, which shows a deploy nudge if not yet deployed).

---

## 9. Screen: Voice Agents Dashboard — With Agents (`/dashboard/voice-agents`)

When user has at least one agent, the full-screen onboarding is replaced by the standard card grid.

```
  Voice Agents                                         [ + New Agent ]

  ┌──────────────────────┐   ┌──────────────────────┐
  │ Smile Dental          │   │ Downtown Bakery       │
  │ ● Active              │   │ ◎ Draft               │
  │ 24 calls · 3 appts   │   │ → Test & deploy       │
  └──────────────────────┘   └──────────────────────┘
```

- Page heading: `font-serif text-2xl text-ink`
- "+ New Agent" navigates to `/dashboard/voice-agents/new` (no `?business` param — user lands on chat with standard greeting)
- Agent cards: `bg-white rounded-xl border border-border p-6 hover:border-accent/40 transition-all cursor-pointer`
- Status dot: `● Active` = `text-success`, `◎ Draft` = `text-muted`
- Draft cards show `→ Test & deploy` nudge in `text-accent text-sm`
- Grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Mobile: single column

---

## 10. Screen: Agent Detail (`/dashboard/voice-agents/[id]`)

### Header

```
  ← Voice Agents

  Smile Dental                                    ● Active
  Dental clinic · +1 (512) 000-0000
  Created Mar 15, 2026

                              [ Test Call ]  [ Deploy / Pause ]
```

### Undeployed nudge banner

Shown when agent status is `DRAFT` or `INACTIVE`:

```
  ┌────────────────────────────────────────────────────┐
  │  This agent isn't live yet.  [ Deploy now → ]      │
  └────────────────────────────────────────────────────┘
```

`bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 text-sm text-accent flex items-center justify-between mb-6`

### Stats row

```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  24 Calls    │  │  3 Appts     │  │  2 Escalated │
  └──────────────┘  └──────────────┘  └──────────────┘
```

"Escalated" count is derived from the calls included in the page query:
`const escalatedCount = agent.calls.filter(c => c.outcome === 'ESCALATED').length`
(The query already fetches up to 20 calls. For a stats-accurate count, add a second `_count` select: `_count: { select: { calls: true, appointments: true } }` plus a raw count filter — see data note below.)

**Data note:** Fetch the escalated count as a separate query in the same server component:
```ts
const escalatedCount = await prisma.call.count({
  where: { agentId: id, outcome: CallOutcome.ESCALATED },
})
```
Pass `escalatedCount` as a prop to the stats row. This is a minor data-layer addition to the existing server component — not an API route change.

### Configuration section

Collapsible. Default state: **collapsed** (hidden). Toggle trigger: a `<button>` row reading "View configuration ▾" / "Hide configuration ▴" in `text-sm text-muted`. Clicking toggles a boolean in local state (client component wrapper needed for this section only). No animation required initially.

Content when expanded: same card grid as current implementation. No changes to the cards themselves.

### Call history

Same table as current. No changes.

---

## 11. What Is NOT Changing

- Database schema — no changes (escalated count derived in application layer)
- API routes — no new routes; builder API gets minor additions (`ready` flag, `topicsCovered` count, accepts `conversationId` for edit mode)
- Auth — no changes
- `AgentConfig` type — no changes
- `DeployButton` logic — restyled only (button classes updated)
- `EditPhoneNumber` logic — no changes
- Settings page — no changes

---

## 12. What IS Changing (Summary)

### Delete
- `src/components/builder/ConfigPreview.tsx` — replaced by `InlineSummaryCard` inside `BuilderChat`
- `src/components/layout/Sidebar.tsx` — replaced by `TopBar`

### Create
- `src/components/layout/TopBar.tsx`
- `src/components/ui/ProgressDots.tsx`
- `src/components/ui/ServiceCard.tsx`
- `src/components/ui/GuidedNextSteps.tsx`
- `src/components/builder/InlineSummaryCard.tsx`
- `src/app/dashboard/(shell)/layout.tsx`
- `src/app/dashboard/(focused)/layout.tsx`
- `src/app/dashboard/(shell)/page.tsx` — VoiceCraft home
- `src/app/dashboard/(shell)/voice-agents/page.tsx`
- `src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`
- `src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx`
- `src/app/dashboard/(focused)/voice-agents/new/page.tsx`
- `src/app/dashboard/(shell)/settings/page.tsx`
- Loading and error boundaries for each new route segment (see below)

### Modify
- `src/app/dashboard/layout.tsx` — remove sidebar, minimal wrapper only
- `src/components/builder/BuilderChat.tsx` — remove Generate button gate, remove ConfigPreview panel, add `initialMessage` prop, add `InlineSummaryCard`, add `ProgressDots`, add edit mode support
- `src/components/builder/ChatMessage.tsx` — update bubble styles
- `src/components/agents/DeployButton.tsx` — restyle only
- `next.config.ts` — add redirects from `/dashboard/agents/*` to `/dashboard/voice-agents/*`

### Loading & error boundaries

Create `loading.tsx` and `error.tsx` for:
- `src/app/dashboard/(shell)/voice-agents/`
- `src/app/dashboard/(shell)/voice-agents/[id]/`
- `src/app/dashboard/(focused)/voice-agents/new/`

Match the style of existing loading/error files (centered spinner on `bg-cream`).

---

## 13. Mobile Behaviour

- **TopBar:** Service nav collapses into a hamburger (`☰`) on `< md` breakpoints. Tap opens a full-width dropdown drawer below the bar (`bg-white border-b border-border`) with service links stacked vertically. Tapping a link or outside the drawer closes it.
- **Service cards (`/dashboard`):** `grid-cols-1` on mobile, `grid-cols-3` on `md+`.
- **Agent cards:** `grid-cols-1` on mobile, `grid-cols-2` on `md+`, `grid-cols-3` on `lg+`.
- **Creation flow input:** Add `pb-safe` (safe area inset) to the input container to handle iOS keyboard push-up. Use `env(safe-area-inset-bottom)` via Tailwind's `pb-[env(safe-area-inset-bottom)]`.
- **Guided next steps cards:** Stack vertically (`flex-col`) on mobile, side-by-side (`flex-row`) on `md+`.
