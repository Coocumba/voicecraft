# VoiceCraft Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the VoiceCraft dashboard from a sidebar-based single-service app into a platform-aware, AI-First experience with a top bar, service cards, and a conversational agent creation flow that works for any business type.

**Architecture:** Next.js App Router route groups `(shell)` and `(focused)` control which layout (TopBar vs. focused back-bar) is applied. The sidebar is removed entirely. The builder chat is rewritten to remove the artificial 4-exchange gate, auto-advance progress dots, and surface an inline config summary when the AI signals readiness. The backend builder prompt is updated to work for any business type.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v3, Prisma/PostgreSQL, NextAuth v5, Anthropic SDK (Claude Sonnet)

**Note on testing:** No test framework is configured in this project. All verification steps use browser checks and `pnpm build` (TypeScript compilation). Add Vitest + React Testing Library to the project in a separate task if unit tests are desired.

---

## Chunk 1: Route Infrastructure

Move pages into route groups, add redirects, update the root dashboard layout to be a minimal wrapper.

---

### Task 1: Add redirects in `next.config.js`

**Files:**
- Modify: `apps/web/next.config.js`

- [ ] **Step 1: Add `redirects` function to next.config.js**

```js
const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@voicecraft/db'],
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  async redirects() {
    return [
      {
        source: '/dashboard/agents',
        destination: '/dashboard/voice-agents',
        permanent: true,
      },
      {
        source: '/dashboard/agents/:path*',
        destination: '/dashboard/voice-agents/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

- [ ] **Step 2: Verify the config is valid**

Run: `cd apps/web && node -e "require('./next.config.js')" && echo OK`
Expected: `OK`

---

### Task 2: Create shared type file

The `AgentConfig` type is currently defined in `ConfigPreview.tsx` (which is being deleted). Move it to a shared location first so other files can import from it.

**Files:**
- Create: `apps/web/src/lib/builder-types.ts`

- [ ] **Step 1: Create the shared types file**

```ts
export interface DayHours {
  open: string
  close: string
}

export interface ServiceItem {
  name: string
  duration: number
  price: number
}

export interface AgentConfig {
  business_name?: string
  hours?: Record<string, DayHours | null>
  services?: ServiceItem[]
  tone?: string
  language?: string
  greeting?: string
  escalation_rules?: string[]
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/builder-types.ts apps/web/next.config.js
git commit -m "feat: add redirects from /agents to /voice-agents, extract AgentConfig type"
```

---

### Task 3: Update root dashboard layout

Strip the sidebar from `dashboard/layout.tsx`. It becomes a minimal auth-guard + `bg-cream` wrapper. The `(shell)` sub-layout will add TopBar.

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Replace layout with minimal wrapper**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-cream">
      {children}
    </div>
  )
}
```

---

### Task 4: Create `(shell)` layout with TopBar placeholder

**Files:**
- Create: `apps/web/src/app/dashboard/(shell)/layout.tsx`

- [ ] **Step 1: Create shell layout with TopBar stub**

```tsx
import { auth } from '@/auth'
import { TopBar } from '@/components/layout/TopBar'

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        userName={session?.user?.name}
        userEmail={session?.user?.email}
      />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
```

Note: `TopBar` doesn't exist yet. **Do not commit Task 4 or Task 6 independently.** Tasks 3, 4, 5, 6, and 7 must be completed and committed together in a single commit at the end of Task 7 to avoid pushing broken TypeScript to the repo.

---

### Task 5: Create `(focused)` layout placeholder

**Files:**
- Create: `apps/web/src/app/dashboard/(focused)/layout.tsx`

- [ ] **Step 1: Create focused layout**

The back-link and ProgressDots are rendered by the individual page, not the layout, because the label/destination varies per service. The focused layout just provides the right shell (no TopBar, full viewport height).

```tsx
export default function FocusedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen bg-cream">
      {children}
    </div>
  )
}
```

---

### Task 6: Move existing pages into `(shell)` route group

**Files to create** (copy content from existing, then delete originals):
- `apps/web/src/app/dashboard/(shell)/settings/page.tsx` ← from `dashboard/settings/page.tsx`
- `apps/web/src/app/dashboard/(shell)/settings/loading.tsx` ← from `dashboard/settings/loading.tsx`
- `apps/web/src/app/dashboard/(shell)/voice-agents/loading.tsx` ← from `dashboard/agents/loading.tsx`
- `apps/web/src/app/dashboard/(shell)/voice-agents/error.tsx` ← from `dashboard/agents/error.tsx` (if exists, else create)
- `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/loading.tsx` ← from `dashboard/agents/[id]/loading.tsx`
- `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/error.tsx` ← from `dashboard/agents/[id]/error.tsx`
- `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/not-found.tsx` ← from `dashboard/agents/[id]/not-found.tsx`

The actual page content (`page.tsx`) files will be rewritten in later tasks — for now create them as stubs that redirect to avoid broken routes.

- [ ] **Step 1: Create stub voice-agents page**

⚠️ Do NOT redirect to `/dashboard/agents` — Task 1 creates a permanent redirect from `/dashboard/agents` → `/dashboard/voice-agents`, which would cause an infinite loop. Redirect to `/dashboard` as a safe fallback until Task 18 replaces this stub.

Create `apps/web/src/app/dashboard/(shell)/voice-agents/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function VoiceAgentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Full implementation in Task 18 — stub redirects to home for now
  redirect('/dashboard')
}
```

- [ ] **Step 2: Copy settings page**

Create `apps/web/src/app/dashboard/(shell)/settings/page.tsx` with the exact same content as `apps/web/src/app/dashboard/settings/page.tsx`.

Create `apps/web/src/app/dashboard/(shell)/settings/loading.tsx` with the same content as the existing settings loading (or a simple spinner):
```tsx
export default function SettingsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-pulse">
      <div className="h-8 w-24 bg-border/50 rounded-lg mb-8" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6 h-32" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create agent detail stubs (loading/error/not-found)**

Create these files fresh (do not copy from `agents/[id]/` — those contain stale `href="/dashboard/agents"` links that would bypass the redirect and add an unnecessary round-trip).

⚠️ Note: `dashboard/agents/error.tsx` does not exist in the codebase — only `dashboard/error.tsx` and `dashboard/agents/[id]/error.tsx` exist. Create the new files fresh.

For `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/not-found.tsx`:
```tsx
import Link from 'next/link'

export default function AgentNotFound() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto text-center py-20">
      <h1 className="font-serif text-2xl text-ink mb-2">Agent not found</h1>
      <p className="text-sm text-muted mb-6">
        This agent doesn&apos;t exist or you don&apos;t have access.
      </p>
      <Link
        href="/dashboard/voice-agents"
        className="text-sm text-accent hover:text-accent/80 font-medium"
      >
        ← Back to Voice Agents
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Create stub agent detail page**

⚠️ Do NOT redirect to `/dashboard/agents/[id]` — that path is covered by the `agents/:path*` redirect in Task 1, creating an infinite loop. Use `/dashboard` as a fallback.

Create `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VoiceAgentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Full implementation in Task 20 — stub redirects to home for now
  void params
  redirect('/dashboard')
}
```

- [ ] **Step 5: Create stub test call page**

Create `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VoiceAgentsTestPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Full implementation in Task 21 — stub redirects to home for now
  void params
  redirect('/dashboard')
}
```

- [ ] **Step 6: Create stub focused creation page**

⚠️ Do NOT redirect to `/dashboard/agents/new` — covered by the `agents/:path*` redirect, creating an infinite loop. Use `/dashboard` as a fallback.

Create `apps/web/src/app/dashboard/(focused)/voice-agents/new/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function NewVoiceAgentPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Full implementation in Task 17 — stub redirects to home for now
  redirect('/dashboard')
}
```

- [ ] **Step 7: Hold — do not commit yet**

Tasks 3–6 leave the repo in a broken state (missing `TopBar`). Complete Task 7 (TopBar) before running type-check or committing. The combined commit happens at the end of Task 7.

---

## Chunk 2: TopBar, Shell Layout, Home Page

---

### Task 7: Update `SignOutButton` + Build `TopBar` component

**Files:**
- Modify: `apps/web/src/components/auth/SignOutButton.tsx`
- Create: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 0: Update SignOutButton to support light backgrounds**

The existing `SignOutButton` uses `text-cream/60` (light text, designed for the dark sidebar). The TopBar dropdown is `bg-white`, making cream text invisible. Add a `variant` prop:

```tsx
"use client"

import { signOut } from "next-auth/react"

interface SignOutButtonProps {
  variant?: 'light' | 'dark'
}

export function SignOutButton({ variant = 'dark' }: SignOutButtonProps) {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className={
        variant === 'light'
          ? "w-full text-left px-3 py-1.5 text-sm text-muted hover:text-ink hover:bg-cream rounded-lg transition-colors"
          : "text-sm text-cream/60 hover:text-cream transition-colors"
      }
    >
      Sign out
    </button>
  )
}
```

Update the Sidebar to pass `variant="dark"` (or nothing, since `dark` is the default) so it continues to work unchanged.

- [ ] **Step 1: Create TopBar**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { cn } from '@/lib/utils'

interface TopBarProps {
  userName?: string | null
  userEmail?: string | null
}

const services = [
  { label: 'Voice Agents', href: '/dashboard/voice-agents', available: true },
  { label: 'SMS Bot', href: '#', available: false },
  { label: 'Chat Widget', href: '#', available: false },
]

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function TopBar({ userName, userEmail }: TopBarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  function isServiceActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? '?'

  return (
    <>
      <header className="bg-white border-b border-border h-14 flex items-center px-4 sm:px-6 gap-4 sticky top-0 z-30">
        {/* Logo */}
        <Link href="/dashboard" className="font-serif text-lg text-ink flex-shrink-0 mr-2">
          VoiceCraft
        </Link>

        {/* Desktop service nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Services">
          {services.map(({ label, href, available }) => {
            if (!available) {
              return (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted opacity-50 cursor-not-allowed select-none"
                  aria-disabled="true"
                >
                  {label}
                  <span className="ml-1.5 text-xs bg-muted/15 px-1.5 py-0.5 rounded-full">Soon</span>
                </span>
              )
            }
            const isCurrent = isServiceActive(href)
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isCurrent
                    ? 'text-accent bg-accent/5'
                    : 'text-muted hover:text-ink hover:bg-cream'
                )}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1 md:flex-none" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/settings"
            className={cn(
              'hidden sm:flex items-center px-3 py-1.5 rounded-lg text-sm transition-colors',
              pathname.startsWith('/dashboard/settings')
                ? 'text-accent bg-accent/5'
                : 'text-muted hover:text-ink hover:bg-cream'
            )}
          >
            Settings
          </Link>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-full bg-accent/10 text-accent text-sm font-medium flex items-center justify-center hover:bg-accent/20 transition-colors"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              {initials}
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-10 z-20 bg-white rounded-xl border border-border shadow-sm min-w-[180px] p-2">
                  <div className="px-3 py-2 mb-1">
                    {userName && <p className="text-sm font-medium text-ink truncate">{userName}</p>}
                    {userEmail && <p className="text-xs text-muted truncate">{userEmail}</p>}
                  </div>
                  <div className="border-t border-border pt-1">
                    <SignOutButton variant="light" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-muted hover:text-ink transition-colors p-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-20 bg-ink/20"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden fixed top-14 left-0 right-0 z-30 bg-white border-b border-border shadow-sm p-3 space-y-1">
            {services.map(({ label, href, available }) => {
              if (!available) {
                return (
                  <span key={label} className="flex items-center justify-between px-3 py-2 text-sm text-muted opacity-50">
                    {label}
                    <span className="text-xs">Soon</span>
                  </span>
                )
              }
              return (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isServiceActive(href)
                      ? 'text-accent bg-accent/5'
                      : 'text-muted hover:text-ink hover:bg-cream'
                  )}
                >
                  {label}
                </Link>
              )
            })}
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center px-3 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-cream transition-colors"
            >
              Settings
            </Link>
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Delete old Sidebar**

```bash
git rm apps/web/src/components/layout/Sidebar.tsx
```

- [ ] **Step 3: Verify TypeScript — all Tasks 3–7 together**

Run: `cd apps/web && pnpm type-check`
Expected: Zero errors. This is the first point where the full route group scaffold + TopBar compile cleanly together.

- [ ] **Step 4: Commit all infrastructure changes in one commit**

This single commit covers Tasks 3, 4, 5, 6, and 7 together:

```bash
git add apps/web/src/app/dashboard/ \
        apps/web/src/components/layout/TopBar.tsx \
        apps/web/src/components/auth/SignOutButton.tsx
git commit -m "feat: route groups (shell)/(focused), TopBar, remove Sidebar"
```

---

### Task 8: Build `ServiceCard` component

**Files:**
- Create: `apps/web/src/components/ui/ServiceCard.tsx`

- [ ] **Step 1: Create ServiceCard**

```tsx
import Link from 'next/link'

interface ServiceCardProps {
  label: string
  description: string
  emoji: string
  href: string
  available: boolean
  stats?: string
  ctaLabel: string
}

export function ServiceCard({
  label,
  description,
  emoji,
  href,
  available,
  stats,
  ctaLabel,
}: ServiceCardProps) {
  if (!available) {
    return (
      <div className="bg-white rounded-xl border border-border p-6 opacity-50 cursor-not-allowed select-none">
        <p className="text-2xl mb-3" aria-hidden="true">{emoji}</p>
        <h2 className="font-medium text-ink mb-1">{label}</h2>
        <p className="text-sm text-muted mb-4">{description}</p>
        <span className="text-xs text-muted">Coming soon</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 hover:border-accent/40 hover:shadow-sm transition-all">
      <p className="text-2xl mb-3" aria-hidden="true">{emoji}</p>
      <h2 className="font-medium text-ink mb-1">{label}</h2>
      <p className="text-sm text-muted mb-1">{description}</p>
      {stats && <p className="text-xs text-muted mb-3">{stats}</p>}
      <div className={stats ? 'mt-2' : 'mt-4'}>
        <Link
          href={href}
          className="inline-flex bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
```

---

### Task 9: Build VoiceCraft home page

This replaces the old "Overview" page with the platform-aware service cards page.

**Files:**
- Create: `apps/web/src/app/dashboard/(shell)/page.tsx`
- Delete (after creating new): `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Create the new home page**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus } from '@voicecraft/db'
import { ServiceCard } from '@/components/ui/ServiceCard'

export const metadata = { title: 'VoiceCraft' }

export default async function DashboardHomePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [agentCount, activeAgentCount, weekCallCount] = await Promise.all([
    prisma.agent.count({ where: { userId: session.user.id } }),
    prisma.agent.count({ where: { userId: session.user.id, status: AgentStatus.ACTIVE } }),
    prisma.call.count({
      where: {
        agent: { userId: session.user.id },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  const firstName = session.user?.name?.split(' ')[0] ?? 'there'

  const voiceAgentsStats =
    agentCount > 0
      ? `${activeAgentCount} active · ${weekCallCount} calls this week`
      : undefined

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">
          Good morning, {firstName}
        </h1>
        <p className="text-sm text-muted mt-1">What would you like to set up today?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ServiceCard
          emoji="🎙"
          label="Voice Agents"
          description="Handle inbound calls automatically for any business."
          href="/dashboard/voice-agents"
          available={true}
          stats={voiceAgentsStats}
          ctaLabel={agentCount > 0 ? 'Open' : 'Get started'}
        />
        <ServiceCard
          emoji="💬"
          label="SMS Bot"
          description="Respond to customer texts automatically."
          href="#"
          available={false}
          ctaLabel="Coming soon"
        />
        <ServiceCard
          emoji="🪟"
          label="Chat Widget"
          description="Embed an AI chat assistant on your website."
          href="#"
          available={false}
          ctaLabel="Coming soon"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the old dashboard/page.tsx**

```bash
git rm apps/web/src/app/dashboard/page.tsx
git rm apps/web/src/app/dashboard/loading.tsx
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds. Visit `/dashboard` in dev and see the service cards page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/(shell)/page.tsx apps/web/src/components/ui/ServiceCard.tsx
git commit -m "feat: add VoiceCraft home page with service cards"
```

---

## Chunk 3: Builder Backend Updates

Update the AI builder to work for any business type and return readiness signals.

---

### Task 10: Update builder system prompt

**Files:**
- Modify: `apps/web/src/lib/builder-prompt.ts`

- [ ] **Step 1: Rewrite the builder system prompt**

The current prompt is hardcoded to dental clinics. Replace it with a business-agnostic version:

```ts
export const BUILDER_SYSTEM_PROMPT = `You are a friendly AI assistant that helps business owners configure a voice agent for their business. Your job is to gather the information needed to set up an intelligent phone agent that can greet callers, answer common questions, handle appointments or enquiries, and escalate complex issues to staff.

## Your Persona
- Warm, professional, and knowledgeable about business phone operations
- Ask questions conversationally — never fire a list of questions at once
- Acknowledge each answer before moving to the next topic
- Adapt your language and examples to the specific business type

## Information to Collect
Work through these five areas in a natural conversation. Do not present them as a checklist.

1. **Business name** — The name of the business
2. **Business hours** — Opening and closing times for each day of the week (some days may be closed)
3. **Services or offerings** — What the business offers, with approximate details (duration, price, or other relevant info). Examples vary by business: a dental clinic lists procedures; a bakery lists products; a gym lists membership types.
4. **Agent tone** — Should the agent sound formal and professional, or warm and friendly? Something in between?
5. **Escalation rules** — Situations where the agent must transfer the call to a human (e.g., emergencies, upset customers, billing disputes, calls explicitly asking to speak to a person)

## Conversation Flow
- The user may start by describing their business type (e.g. "I run a dental clinic") or you may ask them to describe their business first.
- After understanding the business type, transition naturally to hours, then services/offerings, then tone, then escalation.
- Ask one or two questions per turn — never more.
- Confirm and summarise what you've heard before asking for the next piece of information.
- If an answer is ambiguous or incomplete, ask a clarifying follow-up before moving on.
- Once you have covered all five areas and feel confident you have enough detail, close the conversation with exactly this phrase: "I have everything I need to set up your voice agent."

## Output Format
You are having a freeform conversation. Do NOT output JSON during the conversation. Stay in character as a friendly assistant. The configuration will be extracted programmatically from the conversation history once you signal readiness.

## Constraints
- Stay focused on the voice agent configuration. If the user veers off-topic, gently redirect.
- Never invent information — if something is unclear, ask.
- Do not ask for sensitive personal or financial information about the business owner.
- Adapt examples and terminology to the specific business type mentioned.
`

export const BUILDER_READY_SIGNAL = 'I have everything I need to set up your voice agent.'
```

---

### Task 11: Update builder message API to return `topicsCovered` and `ready`

**Files:**
- Modify: `apps/web/src/app/api/builder/message/route.ts`

- [ ] **Step 1: Import the ready signal and add topic tracking**

The response now returns two new fields:
- `topicsCovered: number` — `Math.min(userMessageCount, 5)` (simple heuristic; one dot per user turn up to 5)
- `ready: boolean` — `true` when the AI's response contains `BUILDER_READY_SIGNAL`

```ts
import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/auth"
import { prisma, ConversationStatus } from "@voicecraft/db"
import { BUILDER_SYSTEM_PROMPT, BUILDER_READY_SIGNAL } from "@/lib/builder-prompt"
import { rateLimit } from "@/lib/rate-limit"

const RATE_LIMIT_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 60 * 1000

const anthropic = new Anthropic()

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

function isMessageArray(value: unknown): value is ConversationMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).role === "user" ||
        (typeof item === "object" &&
          item !== null &&
          (item as Record<string, unknown>).role === "assistant") &&
          typeof (item as Record<string, unknown>).content === "string"
    )
  )
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { success } = rateLimit(session.user.id, {
    limit: RATE_LIMIT_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
          "X-RateLimit-Limit": String(RATE_LIMIT_REQUESTS),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 })
  }

  const { conversationId, message } = body as Record<string, unknown>

  if (typeof message !== "string" || message.trim() === "") {
    return Response.json({ error: "message is required and must be a non-empty string" }, { status: 400 })
  }

  const userMessage = message.trim()

  try {
    let conversation: Awaited<ReturnType<typeof prisma.builderConversation.create>> | null = null

    if (conversationId !== undefined) {
      if (typeof conversationId !== "string") {
        return Response.json({ error: "conversationId must be a string" }, { status: 400 })
      }

      conversation = await prisma.builderConversation.findUnique({
        where: { id: conversationId },
      })

      if (!conversation) {
        return Response.json({ error: "Conversation not found" }, { status: 404 })
      }
      if (conversation.userId !== session.user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 })
      }
      if (conversation.status === ConversationStatus.COMPLETED) {
        return Response.json({ error: "Conversation is already completed" }, { status: 409 })
      }
    } else {
      const emptyMessages = [] as unknown as Parameters<
        typeof prisma.builderConversation.create
      >[0]["data"]["messages"]
      conversation = await prisma.builderConversation.create({
        data: {
          userId: session.user.id,
          messages: emptyMessages,
          status: ConversationStatus.IN_PROGRESS,
        },
      })
    }

    const existingMessages: ConversationMessage[] = isMessageArray(conversation.messages)
      ? conversation.messages
      : []

    const updatedMessages: ConversationMessage[] = [
      ...existingMessages,
      { role: "user", content: userMessage },
    ]

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: BUILDER_SYSTEM_PROMPT,
      messages: updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    })

    const assistantContent = claudeResponse.content[0]
    if (!assistantContent || assistantContent.type !== "text") {
      throw new Error("Unexpected response type from Claude")
    }

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: assistantContent.text,
    }

    const finalMessages: ConversationMessage[] = [...updatedMessages, assistantMessage]

    const messagesJson = finalMessages as unknown as Parameters<
      typeof prisma.builderConversation.update
    >[0]["data"]["messages"]

    const updatedConversation = await prisma.builderConversation.update({
      where: { id: conversation.id },
      data: { messages: messagesJson },
    })

    // Derive progress: count user messages, capped at 5
    const userMessageCount = finalMessages.filter((m) => m.role === "user").length
    const topicsCovered = Math.min(userMessageCount, 5)

    // Ready when AI's response contains the readiness signal
    const ready = assistantMessage.content.includes(BUILDER_READY_SIGNAL)

    // If ready, mark the conversation completed so it cannot accept further messages.
    // The generate endpoint also marks it completed, but marking it here ensures
    // consistency even if the user never clicks "Create Agent".
    if (ready) {
      await prisma.builderConversation.update({
        where: { id: updatedConversation.id },
        data: { status: ConversationStatus.COMPLETED },
      })
    }

    return Response.json({
      conversationId: updatedConversation.id,
      response: assistantMessage.content,
      messages: finalMessages,
      topicsCovered,
      ready,
    })
  } catch (err) {
    console.error("[POST /api/builder/message]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

---

### Task 12: Update builder generate extraction prompt

The generate endpoint uses a dental-specific extraction prompt. Update it to work for any business type.

**Files:**
- Modify: `apps/web/src/app/api/builder/generate/route.ts`

- [ ] **Step 1: Replace the dental-specific extraction prompt**

Replace the `EXTRACTION_PROMPT` constant (lines 16–47) with:

```ts
const EXTRACTION_PROMPT = `You are a configuration extractor. Given a conversation between a user and an assistant about setting up a voice agent for any business, extract the structured configuration as valid JSON.

Output ONLY a JSON object with no surrounding text, code fences, or explanation. Use this exact schema:

{
  "business_name": "string",
  "hours": {
    "monday":    { "open": "HH:MM", "close": "HH:MM" } | null,
    "tuesday":   { "open": "HH:MM", "close": "HH:MM" } | null,
    "wednesday": { "open": "HH:MM", "close": "HH:MM" } | null,
    "thursday":  { "open": "HH:MM", "close": "HH:MM" } | null,
    "friday":    { "open": "HH:MM", "close": "HH:MM" } | null,
    "saturday":  { "open": "HH:MM", "close": "HH:MM" } | null,
    "sunday":    { "open": "HH:MM", "close": "HH:MM" } | null
  },
  "services": [
    { "name": "string", "duration": number, "price": number }
  ],
  "tone": "formal" | "friendly" | "neutral",
  "language": "string",
  "greeting": "string",
  "escalation_rules": ["string"]
}

Rules:
- Use null for days the business is closed.
- Use 24-hour time (e.g., "09:00", "17:30").
- duration is in minutes (integer). Use 0 if duration is not applicable for this business type.
- price is in USD (number, no currency symbol). Use 0 if price is not applicable.
- escalation_rules is an array of plain-English strings describing when to transfer to a human.
- If a field cannot be determined from the conversation, use a sensible default (e.g., empty array, "friendly" tone, "en" language).
- Adapt the services list to the actual business type (products, services, offerings, menu items, etc.).
- Never add extra keys or wrapper objects.`
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/web && pnpm type-check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/builder-prompt.ts apps/web/src/app/api/builder/message/route.ts apps/web/src/app/api/builder/generate/route.ts
git commit -m "feat: update builder for any business type, add topicsCovered and ready signals"
```

---

## Chunk 4: Creation Flow UI

Build the new AI-First creation experience.

---

### Task 13: Build `ProgressDots` component

**Files:**
- Create: `apps/web/src/components/ui/ProgressDots.tsx`

- [ ] **Step 1: Create ProgressDots**

```tsx
interface ProgressDotsProps {
  total: number
  current: number
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${current} of ${total} topics covered`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={
            i < current
              ? 'w-2 h-2 rounded-full bg-accent'
              : 'w-2 h-2 rounded-full border border-border bg-transparent'
          }
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
```

---

### Task 14: Restyle `ChatMessage` component

**Files:**
- Modify: `apps/web/src/components/builder/ChatMessage.tsx`

- [ ] **Step 1: Update bubble styles**

```tsx
export interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex flex-col gap-1 max-w-[80%] self-end items-end">
        <span className="text-xs text-muted px-1">You</span>
        <div className="bg-accent/10 text-ink rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }


  // Assistant message: first sentence in serif, rest in sans
  const firstPeriod = message.content.search(/[.!?](\s|$)/)
  const firstSentence = firstPeriod >= 0 ? message.content.slice(0, firstPeriod + 1) : message.content
  const rest = firstPeriod >= 0 ? message.content.slice(firstPeriod + 1) : ''

  return (
    <div className="flex flex-col gap-1 max-w-[80%] self-start items-start">
      <span className="text-xs text-muted px-1">VoiceCraft</span>
      <div className="bg-cream rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        <span className="font-serif">{firstSentence}</span>
        {rest && <span>{rest}</span>}
      </div>
    </div>
  )
}
```

---

### Task 15: Build `InlineSummaryCard` component

**Files:**
- Create: `apps/web/src/components/builder/InlineSummaryCard.tsx`

- [ ] **Step 1: Create InlineSummaryCard**

```tsx
import type { AgentConfig } from '@/lib/builder-types'

interface InlineSummaryCardProps {
  config: AgentConfig
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export function InlineSummaryCard({ config }: InlineSummaryCardProps) {
  const openDays = config.hours
    ? Object.entries(config.hours)
        .filter(([, h]) => h !== null)
        .map(([day]) => DAY_LABELS[day] ?? day)
        .join(', ')
    : null

  return (
    <div className="bg-white rounded-xl border border-border p-4 my-3 space-y-2 text-sm">
      {config.business_name && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Business</span>
          <span className="text-ink font-medium text-right">{config.business_name}</span>
        </div>
      )}
      {openDays && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Open</span>
          <span className="text-ink text-right">{openDays}</span>
        </div>
      )}
      {config.tone && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Tone</span>
          <span className="text-ink capitalize text-right">{config.tone}</span>
        </div>
      )}
      {config.greeting && (
        <div className="flex flex-col gap-1">
          <span className="text-muted">Greeting</span>
          <span className="text-ink italic text-xs line-clamp-2">&ldquo;{config.greeting}&rdquo;</span>
        </div>
      )}
      {config.services && config.services.length > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Services</span>
          <span className="text-ink text-right">
            {config.services.slice(0, 3).map((s) => s.name).join(', ')}
            {config.services.length > 3 ? ` +${config.services.length - 3} more` : ''}
          </span>
        </div>
      )}
      {config.escalation_rules && config.escalation_rules.length > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted flex-shrink-0">Escalation</span>
          <span className="text-ink text-right">
            {config.escalation_rules.length} rule{config.escalation_rules.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
```

---

### Task 16: Rewrite `BuilderChat` component

⚠️ **Dependency:** This task requires Chunk 3 (Tasks 10–12) to be completed first. `BuilderChat` relies on `topicsCovered: number` and `ready: boolean` fields in the `/api/builder/message` response. These fields are added in Task 11. Verify the API returns them before implementing the auto-generate flow.

This is the most significant change. The new `BuilderChat`:
- Accepts `initialMessage`, `conversationId`, `agentId` props (for both new and edit modes)
- Removes the side panel and the 4-exchange gate
- Tracks `topicsCovered` for ProgressDots
- Auto-calls generate when `ready: true`
- Shows `InlineSummaryCard` + "Create Agent" button
- In edit mode, patches the existing agent instead of creating a new one

**Files:**
- Modify: `apps/web/src/components/builder/BuilderChat.tsx`

- [ ] **Step 1: Rewrite BuilderChat**

```tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChatMessage, type Message } from './ChatMessage'
import { InlineSummaryCard } from './InlineSummaryCard'
import type { AgentConfig } from '@/lib/builder-types'

interface BuilderChatProps {
  initialMessage?: string
  conversationId?: string
  agentId?: string
  editMode?: boolean
  onTopicsChange?: (count: number) => void
}

interface MessageResponse {
  conversationId: string
  response: string
  messages: Message[]
  topicsCovered: number
  ready: boolean
}

interface GenerateResponse {
  config: AgentConfig
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hi! I'm here to help you set up your voice agent. Tell me about your business — what do you do and what's it called?",
}

export function BuilderChat({
  initialMessage,
  conversationId: initialConversationId,
  agentId,
  editMode = false,
  onTopicsChange,
}: BuilderChatProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null
  )
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generatedConfig, setGeneratedConfig] = useState<AgentConfig | null>(null)
  const [topicsCovered, setTopicsCovered] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const didAutoSend = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-send the initial message (from empty state or edit mode) once on mount
  useEffect(() => {
    if (initialMessage && !didAutoSend.current) {
      didAutoSend.current = true
      void sendMessage(initialMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendMessage(text: string) {
    if (!text.trim() || isSending) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsSending(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch('/api/builder/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversationId } : {}),
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to send message')
      }

      const data = (await res.json()) as MessageResponse
      setConversationId(data.conversationId)
      setTopicsCovered(data.topicsCovered)
      onTopicsChange?.(data.topicsCovered)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])

      // AI signalled readiness — auto-generate config
      if (data.ready && !generatedConfig) {
        await generateConfig(data.conversationId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setIsSending(false)
    }
  }

  async function generateConfig(convId: string) {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to generate configuration')
      }

      const data = (await res.json()) as GenerateResponse
      setGeneratedConfig(data.config)
      // /api/builder/generate has no topicsCovered field — set to 5 (the ProgressDots
      // total) to signal completion. If total changes, update both together.
      setTopicsCovered(5)
      onTopicsChange?.(5)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate configuration'
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!generatedConfig || isSaving) return
    setIsSaving(true)

    const businessName = generatedConfig.business_name ?? 'My Agent'

    try {
      if (editMode && agentId) {
        // Update existing agent
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName,
            config: generatedConfig,
          }),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to update agent')
        }
        toast.success('Agent updated!')
        router.push(`/dashboard/voice-agents/${agentId}`)
      } else {
        // Create new agent
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: businessName,
            businessName,
            config: generatedConfig,
          }),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to create agent')
        }
        const data = (await res.json()) as { agent: { id: string } }
        toast.success('Agent created!')
        router.push(`/dashboard/voice-agents/${data.agent.id}?new=true`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const inputDisabled = isSending || isGenerating || !!generatedConfig

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {/* Generating indicator */}
        {isGenerating && (
          <div className="self-start">
            <div className="bg-cream rounded-2xl rounded-bl-md px-4 py-3">
              <span className="text-xs text-muted">Setting up your agent…</span>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isSending && !isGenerating && (
          <div className="self-start">
            <div className="bg-cream rounded-2xl rounded-bl-md px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {/* Inline summary + CTA */}
        {generatedConfig && (
          <div className="self-start w-full max-w-[80%]">
            <InlineSummaryCard config={generatedConfig} />
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="w-full bg-accent text-white py-3 rounded-xl font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isSaving
                ? editMode ? 'Saving changes…' : 'Creating agent…'
                : editMode ? 'Save changes' : 'Create Agent'}
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className={`px-5 py-4 border-t border-border flex gap-3 items-end flex-shrink-0 bg-white pb-[env(safe-area-inset-bottom)] ${inputDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          disabled={inputDisabled}
          className="flex-1 px-3 py-2 border border-border rounded-xl bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none min-h-[40px] max-h-40 disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage(input)}
          disabled={inputDisabled || !input.trim()}
          className="bg-ink text-cream px-4 py-2 rounded-xl text-sm hover:bg-ink/90 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete ConfigPreview**

```bash
git rm apps/web/src/components/builder/ConfigPreview.tsx
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd apps/web && pnpm type-check`
Expected: No errors related to BuilderChat or InlineSummaryCard.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/builder/ apps/web/src/components/ui/ProgressDots.tsx
git commit -m "feat: rewrite BuilderChat with AI-First flow, add ProgressDots and InlineSummaryCard"
```

---

### Task 17: Build the focused creation page

**Files:**
- Create: `apps/web/src/components/builder/NewVoiceAgentClient.tsx`
- Modify: `apps/web/src/app/dashboard/(focused)/voice-agents/new/page.tsx`
- Create: `apps/web/src/app/dashboard/(focused)/voice-agents/new/loading.tsx`
- Create: `apps/web/src/app/dashboard/(focused)/voice-agents/new/error.tsx`

- [ ] **Step 1: Build the creation page**

The server page delegates to a client wrapper so that `ProgressDots` count can be lifted into state and updated via `BuilderChat`'s `onTopicsChange` callback.

**Step 1a — Create `NewVoiceAgentClient` client wrapper**

Create `apps/web/src/components/builder/NewVoiceAgentClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BuilderChat } from './BuilderChat'
import { ProgressDots } from '@/components/ui/ProgressDots'

interface NewVoiceAgentClientProps {
  initialMessage?: string
  conversationId?: string
  agentId?: string
  editMode?: boolean
}

export function NewVoiceAgentClient({
  initialMessage,
  conversationId,
  agentId,
  editMode,
}: NewVoiceAgentClientProps) {
  const [topicsCovered, setTopicsCovered] = useState(0)

  return (
    <div className="flex flex-col h-screen">
      {/* Focused top bar */}
      <div className="bg-white border-b border-border h-14 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <Link
          href="/dashboard/voice-agents"
          className="text-sm text-muted hover:text-ink transition-colors flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span>
          Voice Agents
        </Link>
        <ProgressDots total={5} current={topicsCovered} />
      </div>

      {/* Chat fills remaining height */}
      <div className="flex-1 min-h-0">
        <BuilderChat
          initialMessage={initialMessage}
          conversationId={conversationId}
          agentId={agentId}
          editMode={editMode}
          onTopicsChange={setTopicsCovered}
        />
      </div>
    </div>
  )
}
```

**Step 1b — Update the page to use the client wrapper**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NewVoiceAgentClient } from '@/components/builder/NewVoiceAgentClient'

export const metadata = { title: 'New Agent — VoiceCraft' }

interface PageProps {
  searchParams: Promise<{
    business?: string
    conversationId?: string
    agentId?: string
    edit?: string
  }>
}

export default async function NewVoiceAgentPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const params = await searchParams
  const business = params.business ? decodeURIComponent(params.business) : undefined
  const conversationId = params.conversationId
  const agentId = params.agentId
  const editMode = params.edit === 'true'
  // In edit mode without a business description, auto-send an opening message
  const initialMessage = business ?? (editMode ? "I'd like to change something about my agent." : undefined)

  return (
    <NewVoiceAgentClient
      initialMessage={initialMessage}
      conversationId={conversationId}
      agentId={agentId}
      editMode={editMode}
    />
  )
}
```

- [ ] **Step 2: Create loading state**

```tsx
export default function NewAgentLoading() {
  return (
    <div className="flex flex-col h-screen">
      <div className="bg-white border-b border-border h-14 flex-shrink-0" />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create error boundary**

```tsx
'use client'

export default function NewAgentError() {
  return (
    <div className="flex flex-col h-screen items-center justify-center p-6">
      <p className="font-serif text-lg text-ink mb-2">Something went wrong</p>
      <p className="text-sm text-muted">Please refresh the page and try again.</p>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds. The old `agents/new` page still works (redirects from the new route for now).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/(focused)/
git commit -m "feat: build focused creation page with BuilderChat and ProgressDots"
```

---

## Chunk 5: Agent Management Pages

---

### Task 18: Build Voice Agents list page with empty-state onboarding

This is the page at `/dashboard/voice-agents`. It shows either the full-screen AI onboarding (no agents) or the agent card grid (has agents).

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/page.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/loading.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/error.tsx`

- [ ] **Step 1: Build the Voice Agents page**

```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma, AgentStatus } from '@voicecraft/db'
import { formatDate } from '@/lib/date-utils'
import { VoiceAgentsEmptyState } from '@/components/agents/VoiceAgentsEmptyState'

export const metadata = { title: 'Voice Agents — VoiceCraft' }

function statusDotClass(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE:
      return 'text-success'
    case AgentStatus.INACTIVE:
      return 'text-red-500'
    default:
      return 'text-muted'
  }
}

function statusLabel(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'Active'
    case AgentStatus.INACTIVE: return 'Inactive'
    default: return 'Draft'
  }
}

export default async function VoiceAgentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const agents = await prisma.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { calls: true, appointments: true } },
    },
  })

  if (agents.length === 0) {
    return <VoiceAgentsEmptyState />
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">Voice Agents</h1>
        <Link
          href="/dashboard/voice-agents/new"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
        >
          + New Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const isDraft = agent.status === AgentStatus.DRAFT
          return (
            <Link
              key={agent.id}
              href={`/dashboard/voice-agents/${agent.id}`}
              className="bg-white rounded-xl border border-border p-6 hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-ink group-hover:text-accent transition-colors truncate">
                    {agent.name}
                  </h2>
                  <p className="text-sm text-muted truncate mt-0.5">{agent.businessName}</p>
                </div>
              </div>

              {isDraft ? (
                <p className="text-xs text-accent mt-3">→ Test &amp; deploy</p>
              ) : (
                <p className="text-xs text-muted mt-3">
                  {agent._count.calls} calls · {agent._count.appointments} appts
                </p>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className={`text-xs font-medium ${statusDotClass(agent.status)}`}>
                  {statusLabel(agent.status)}
                </span>
                <span className="text-xs text-muted">{formatDate(agent.createdAt)}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `VoiceAgentsEmptyState` component**

Create `apps/web/src/components/agents/VoiceAgentsEmptyState.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EXAMPLE_PROMPTS = [
  'A dental clinic',
  'A hair salon',
  'A law firm',
  'A bakery',
  'A gym',
  'A plumbing company',
]

export function VoiceAgentsEmptyState() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    router.push(`/dashboard/voice-agents/new?business=${encodeURIComponent(trimmed)}`)
  }

  function handleExampleClick(prompt: string) {
    setValue(prompt)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 pb-16">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-3 text-center">
        Tell me about your business
      </h1>
      <p className="text-sm text-muted mb-8 text-center max-w-sm">
        Describe your business and I&apos;ll set up a voice agent tailored for you.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="A dental clinic, a bakery, a gym…"
            className="flex-1 px-5 py-4 rounded-xl border border-border bg-white text-ink text-base focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-5 py-4 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Get started"
          >
            →
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 mt-4 justify-center max-w-xl">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleExampleClick(prompt)}
            className="text-sm text-muted hover:text-ink hover:bg-white px-3 py-1.5 rounded-lg border border-transparent hover:border-border transition-all"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create loading state**

Create `apps/web/src/app/dashboard/(shell)/voice-agents/loading.tsx`:
```tsx
export default function VoiceAgentsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-36 bg-border/50 rounded-lg" />
        <div className="h-9 w-28 bg-border/50 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6 h-36" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create error boundary**

Create `apps/web/src/app/dashboard/(shell)/voice-agents/error.tsx`:
```tsx
'use client'

import Link from 'next/link'

export default function VoiceAgentsError() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto text-center py-20">
      <p className="font-serif text-lg text-ink mb-2">Could not load agents</p>
      <p className="text-sm text-muted mb-6">Please refresh the page.</p>
      <Link href="/dashboard" className="text-sm text-accent hover:text-accent/80 font-medium">
        ← Back to home
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/(shell)/voice-agents/ apps/web/src/components/agents/VoiceAgentsEmptyState.tsx
git commit -m "feat: add Voice Agents list page with AI-First empty state"
```

---

### Task 19: Build `GuidedNextSteps` component

**Files:**
- Create: `apps/web/src/components/agents/GuidedNextSteps.tsx`

- [ ] **Step 1: Create GuidedNextSteps**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface GuidedNextStepsProps {
  agentId: string
  agentName: string
  hasTested?: boolean
}

export function GuidedNextSteps({ agentId, agentName, hasTested = false }: GuidedNextStepsProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(true)

  // Strip ?new=true / ?tested=true from URL on mount, keep UI visible via local state
  useEffect(() => {
    router.replace(`/dashboard/voice-agents/${agentId}`)
  }, [agentId, router])

  if (!visible) return null

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-success font-medium text-sm">✓</span>
        <h2 className="font-serif text-xl text-ink">{agentName} is ready</h2>
      </div>
      <p className="text-sm text-muted mb-5">Here&apos;s what to do next:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Test card — primary (before testing); secondary (after testing) */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="font-medium text-ink mb-1">🔊 Test your agent</p>
          <p className="text-sm text-muted mb-4">
            Hear exactly how it sounds before going live.
          </p>
          <a
            href={`/dashboard/voice-agents/${agentId}/test`}
            className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasTested
                ? 'bg-white border border-border text-ink hover:bg-cream'
                : 'bg-accent text-white hover:bg-accent/90'
            }`}
          >
            {hasTested ? 'Test again' : 'Start test call'}
          </a>
        </div>

        {/* Deploy card — secondary (before testing); primary (after testing) */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="font-medium text-ink mb-1">🚀 Deploy to a phone number</p>
          <p className="text-sm text-muted mb-4">
            Go live and start handling real calls.
          </p>
          <button
            onClick={() => {
              setVisible(false)
              // Scroll down to the deploy section (id on the nudge banner below)
              document.getElementById('deploy-section')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className={`inline-flex px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasTested
                ? 'bg-accent text-white hover:bg-accent/90'
                : 'bg-white border border-border text-ink hover:bg-cream'
            }`}
          >
            Set phone number
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        {hasTested ? 'Ready to go live.' : 'We recommend testing first.'}
      </p>
    </div>
  )
}
```

---

### Task 20: Build Agent Detail page

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/loading.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/error.tsx`

- [ ] **Step 1: Build the agent detail page**

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma, AgentStatus, CallOutcome } from '@voicecraft/db'
import { formatDate, formatDateTime, formatDuration } from '@/lib/date-utils'
import { DeployButton } from '@/components/agents/DeployButton'
import { EditPhoneNumber } from '@/components/agents/EditPhoneNumber'
import { GuidedNextSteps } from '@/components/agents/GuidedNextSteps'
import { CollapsibleConfig } from '@/components/agents/CollapsibleConfig'
import type { AgentConfig } from '@/lib/builder-types'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string; tested?: string }>
}

function isAgentConfig(value: unknown): value is AgentConfig {
  return typeof value === 'object' && value !== null
}

function statusBadgeClass(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'bg-success/10 text-success'
    case AgentStatus.INACTIVE: return 'bg-red-100 text-red-700'
    default: return 'bg-muted/15 text-muted'
  }
}

function statusLabel(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'Active'
    case AgentStatus.INACTIVE: return 'Inactive'
    default: return 'Draft'
  }
}

function outcomeBadgeClass(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED: return 'bg-success/10 text-success'
    case CallOutcome.MISSED: return 'bg-muted/15 text-muted'
    case CallOutcome.ESCALATED: return 'bg-accent/10 text-accent'
    default: return 'bg-muted/15 text-muted'
  }
}

function outcomeLabel(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED: return 'Completed'
    case CallOutcome.MISSED: return 'Missed'
    case CallOutcome.ESCALATED: return 'Escalated'
    default: return outcome
  }
}

export default async function VoiceAgentDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const { new: isNew, tested: isTested } = await searchParams

  const [agent, escalatedCount] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        calls: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { calls: true, appointments: true } },
      },
    }),
    prisma.call.count({
      where: { agentId: id, outcome: CallOutcome.ESCALATED },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = isAgentConfig(agent.config) ? agent.config : null
  const isDraft = agent.status === AgentStatus.DRAFT

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">

      {/* Guided next steps — shown after creation (?new=true) or after testing (?tested=true) */}
      {(isNew === 'true' || isTested === 'true') && (
        <GuidedNextSteps agentId={agent.id} agentName={agent.name} hasTested={isTested === 'true'} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link
            href="/dashboard/voice-agents"
            className="text-xs text-muted hover:text-ink transition-colors mb-2 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">←</span> Voice Agents
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="font-serif text-2xl sm:text-3xl text-ink">{agent.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(agent.status)}`}>
              {statusLabel(agent.status)}
            </span>
          </div>
          <p className="text-sm text-muted mt-1">{agent.businessName}</p>
          <p className="text-xs text-muted mt-0.5">Created {formatDate(agent.createdAt)}</p>
        </div>

        <div id="agent-header-actions" className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/dashboard/voice-agents/${agent.id}/test`}
            className="bg-white text-ink px-4 py-2 rounded-lg text-sm border border-border hover:bg-cream font-medium transition-colors"
          >
            Test Call
          </Link>
          <DeployButton agentId={agent.id} currentStatus={agent.status} />
        </div>
      </div>

      {/* Undeployed nudge — links to the header DeployButton (single source of truth) */}
      {isDraft && (
        <div id="deploy-section" className="flex items-center justify-between bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 text-sm text-accent mb-6">
          <span>This agent isn&apos;t live yet.</span>
          <a
            href="#agent-header-actions"
            className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap"
          >
            Deploy now →
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Total Calls</p>
          <p className="font-serif text-3xl text-ink">{agent._count.calls}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Appointments</p>
          <p className="font-serif text-3xl text-ink">{agent._count.appointments}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Escalated</p>
          <p className="font-serif text-3xl text-ink">{escalatedCount}</p>
        </div>
      </div>

      {/* Phone number */}
      <div className="bg-white rounded-xl border border-border p-5 mb-8">
        <p className="text-xs text-muted font-medium mb-2">Phone Number</p>
        <EditPhoneNumber agentId={agent.id} currentNumber={agent.phoneNumber} />
      </div>

      {/* Collapsible config */}
      {config && (
        <div className="mb-8">
          <CollapsibleConfig config={config} />
        </div>
      )}

      {/* Call history */}
      <section>
        <h2 className="font-serif text-lg text-ink mb-4">Call History</h2>
        {agent.calls.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-10 text-center">
            <p className="text-sm text-muted">No calls recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Caller</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Duration</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agent.calls.map((call) => (
                    <tr key={call.id} className="hover:bg-cream/50 transition-colors">
                      <td className="px-5 py-3 text-ink whitespace-nowrap">{formatDateTime(call.createdAt)}</td>
                      <td className="px-5 py-3 text-muted">{call.callerNumber ?? 'Unknown'}</td>
                      <td className="px-5 py-3 text-muted">{call.duration != null ? formatDuration(call.duration) : '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcomeBadgeClass(call.outcome)}`}>
                          {outcomeLabel(call.outcome)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create `CollapsibleConfig` component**

Create `apps/web/src/components/agents/CollapsibleConfig.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { AgentConfig } from '@/lib/builder-types'

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

interface CollapsibleConfigProps {
  config: AgentConfig
}

export function CollapsibleConfig({ config }: CollapsibleConfigProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-4"
      >
        <span>{open ? '▴' : '▾'}</span>
        <span>{open ? 'Hide configuration' : 'View configuration'}</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.greeting && (
            <div className="bg-white rounded-xl border border-border p-5 md:col-span-2">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">Greeting</p>
              <p className="text-sm text-ink italic">&ldquo;{config.greeting}&rdquo;</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-border p-5">
            <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Details</p>
            <div className="space-y-2">
              {config.tone && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Tone</span>
                  <span className="text-ink capitalize">{config.tone}</span>
                </div>
              )}
              {config.language && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Language</span>
                  <span className="text-ink uppercase">{config.language}</span>
                </div>
              )}
            </div>
          </div>

          {config.services && config.services.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Services</p>
              <div className="space-y-2">
                {config.services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-muted">{s.duration}min · ${s.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.hours && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Business Hours</p>
              <div className="space-y-1.5">
                {Object.entries(config.hours).map(([day, hours]) => (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{DAY_LABELS[day] ?? day}</span>
                    <span className="text-ink">{hours ? `${hours.open} – ${hours.close}` : 'Closed'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.escalation_rules && config.escalation_rules.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Escalation Rules</p>
              <ul className="space-y-1.5">
                {config.escalation_rules.map((rule, i) => (
                  <li key={i} className="text-sm text-ink flex gap-2">
                    <span className="text-muted flex-shrink-0">·</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create loading and error files**

`apps/web/src/app/dashboard/(shell)/voice-agents/[id]/loading.tsx`:
```tsx
export default function AgentDetailLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-4 w-24 bg-border/50 rounded mb-4" />
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="space-y-2">
          <div className="h-9 w-64 bg-border/50 rounded-lg" />
          <div className="h-4 w-40 bg-border/50 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-border/50 rounded-lg" />
          <div className="h-9 w-28 bg-border/50 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-24" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-border h-64" />
    </div>
  )
}
```

`apps/web/src/app/dashboard/(shell)/voice-agents/[id]/error.tsx`:
```tsx
'use client'

import Link from 'next/link'

export default function AgentDetailError() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto text-center py-20">
      <p className="font-serif text-lg text-ink mb-2">Could not load agent</p>
      <p className="text-sm text-muted mb-6">Please refresh the page.</p>
      <Link href="/dashboard/voice-agents" className="text-sm text-accent hover:text-accent/80 font-medium">
        ← Back to Voice Agents
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/(shell)/voice-agents/[id]/ apps/web/src/components/agents/
git commit -m "feat: build agent detail page with guided next steps and collapsible config"
```

---

### Task 21: Build Test Call page

**Files:**
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx`
- Create: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/loading.tsx`

- [ ] **Step 1: Build the test call page**

```tsx
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@voicecraft/db'
import { TestCallClient } from '@/components/agents/TestCallClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = { title: 'Test Call — VoiceCraft' }

export default async function VoiceAgentTestPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const agent = await prisma.agent.findUnique({ where: { id } })

  if (!agent || agent.userId !== session.user.id) notFound()

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a
          href={`/dashboard/voice-agents/${agent.id}`}
          className="text-xs text-muted hover:text-ink transition-colors inline-flex items-center gap-1 mb-4"
        >
          <span aria-hidden="true">←</span> {agent.name}
        </a>
        <h1 className="font-serif text-2xl text-ink">Test Call</h1>
        <p className="text-sm text-muted mt-1">
          Your agent will answer as if a real customer called. Say anything to test it.
        </p>
      </div>

      <TestCallClient
        agent={{
          id: agent.id,
          name: agent.name,
          businessName: agent.businessName,
          status: agent.status,
        }}
      />

      {/* Post-test actions */}
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-sm text-muted mb-4">After your test call:</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={`/dashboard/voice-agents/${agent.id}?tested=true`}
            className="inline-flex items-center justify-center bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            👍 Looks good — Deploy it
          </a>
          <a
            href={`/dashboard/voice-agents/new?agentId=${agent.id}&edit=true`}
            className="inline-flex items-center justify-center bg-white border border-border text-ink px-4 py-2 rounded-lg text-sm hover:bg-cream font-medium transition-colors"
          >
            💬 Something needs changing
          </a>
        </div>
      </div>
    </div>
  )
}
```

**Known spec deviation:** The spec (section 8) requires `conversationId` in this link so `BuilderChat` restores the prior conversation context. This is blocked by a schema gap — `BuilderConversation` has no `agentId` FK, so the server cannot look up the conversation from the agent ID. The user will start a fresh edit conversation instead. See Task 23 for the follow-up schema migration that resolves this.

- [ ] **Step 2: Create loading state**

```tsx
export default function TestCallLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto animate-pulse">
      <div className="h-4 w-24 bg-border/50 rounded mb-4" />
      <div className="h-8 w-32 bg-border/50 rounded-lg mb-2" />
      <div className="h-4 w-64 bg-border/50 rounded mb-8" />
      <div className="bg-white rounded-xl border border-border h-48" />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/
git commit -m "feat: build test call page with post-test actions"
```

---

### Task 22: Final cleanup — remove old routes

- [ ] **Step 1: Remove old agents directory**

```bash
git rm -r apps/web/src/app/dashboard/agents/
```

- [ ] **Step 2: Remove old dashboard page stubs if any remain**

Check if `apps/web/src/app/dashboard/page.tsx` still exists and remove if so:
```bash
ls apps/web/src/app/dashboard/
# Remove any page.tsx, loading.tsx that were not already removed
```

- [ ] **Step 3: Final TypeScript check**

Run: `cd apps/web && pnpm type-check`
Expected: Zero errors.

- [ ] **Step 4: Final build**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Smoke test in browser**

Start dev server: `cd apps/web && pnpm dev`

Verify each route loads:
- `/dashboard` → VoiceCraft home with service cards
- `/dashboard/voice-agents` → Empty state AI prompt (if no agents) or card grid
- `/dashboard/voice-agents/new` → Focused chat page
- `/dashboard/voice-agents/new?business=dental+clinic` → Chat with auto-sent first message
- `/dashboard/voice-agents/[id]` → Agent detail with stats
- `/dashboard/voice-agents/[id]/test` → Test call page
- `/dashboard/agents` → Redirects to `/dashboard/voice-agents`
- `/dashboard/settings` → Settings page

- [ ] **Step 6: Final commit**

```bash
git add apps/web/src/app/dashboard/ apps/web/src/components/ apps/web/src/lib/ apps/web/src/app/api/
git commit -m "feat: complete VoiceCraft dashboard redesign — AI-First platform navigation"
```

---

### Task 23: Link BuilderConversation to Agent (spec gap follow-up)

This resolves the known spec deviation in Task 21 where the test-page edit link cannot pass `conversationId` because `BuilderConversation` has no relation to `Agent`.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_link_conversation_to_agent/migration.sql`
- Modify: `apps/web/src/app/api/agents/route.ts` (store `conversationId` on create)
- Modify: `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx` (pass `conversationId`)

- [ ] **Step 1: Add `conversationId` to the Agent schema**

In `packages/db/prisma/schema.prisma`, add an optional relation from `Agent` to `BuilderConversation`:

```prisma
model Agent {
  // ... existing fields ...
  conversationId    String?
  conversation      BuilderConversation? @relation(fields: [conversationId], references: [id])
  // ...
}

model BuilderConversation {
  // ... existing fields ...
  agents            Agent[]
}
```

- [ ] **Step 2: Run migration**

```bash
cd packages/db && npx prisma migrate dev --name link_conversation_to_agent
make db-generate
```

Expected: Migration file created, Prisma client regenerated.

- [ ] **Step 3: Store `conversationId` when creating agent**

In `apps/web/src/app/api/agents/route.ts` (POST handler), accept `conversationId` in the body and include it in `prisma.agent.create`:

```ts
const { name, businessName, config, voiceSettings, conversationId } = body as Record<string, unknown>
// in create data:
...(typeof conversationId === 'string' && conversationId ? { conversationId } : {})
```

In `BuilderChat.tsx`, pass `conversationId` in the POST body during `handleSave`:
```ts
body: JSON.stringify({
  name: businessName,
  businessName,
  config: generatedConfig,
  conversationId: conversationId ?? convId,
})
```

- [ ] **Step 4: Look up `conversationId` in the test page**

In `apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx`, include `conversationId` in the `findUnique` select and pass it in the link:

```ts
const agent = await prisma.agent.findUnique({
  where: { id },
  select: { id: true, name: true, businessName: true, status: true, userId: true, conversationId: true },
})
// ...
href={`/dashboard/voice-agents/new?agentId=${agent.id}&edit=true${agent.conversationId ? `&conversationId=${agent.conversationId}` : ''}`}
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds. Editing an agent from the test page now restores prior conversation context.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/ apps/web/src/app/api/agents/route.ts apps/web/src/components/builder/BuilderChat.tsx apps/web/src/app/dashboard/(shell)/voice-agents/[id]/test/page.tsx
git commit -m "feat: link BuilderConversation to Agent for edit-mode context restoration"
```
