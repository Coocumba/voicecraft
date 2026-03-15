# VoiceCraft — Claude Code Guide

## Project Overview

VoiceCraft is a voice AI platform for SMBs (starting with dental clinics). Users chat with an AI to describe their business, an agent config is generated, and a LiveKit voice agent handles real phone calls. Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and the HelpNest editorial design system.

---

## Tech Stack

| Layer         | Choice                                  |
|---------------|------------------------------------------|
| Framework     | Next.js 16 (App Router)                  |
| Language      | TypeScript (strict mode)                 |
| Styling       | Tailwind CSS v3 + CSS variables          |
| Fonts         | Lora (serif) + Source Sans 3 (sans)      |
| Database      | PostgreSQL + Prisma (`@voicecraft/db`)   |
| Auth          | NextAuth v5 (Auth.js)                    |
| Builder LLM   | Claude Sonnet (`@anthropic-ai/sdk`)     |
| Voice Agent   | LiveKit (Deepgram STT + Gemini LLM + ElevenLabs TTS) |
| Toasts        | Sonner                                   |
| Runtime       | Node.js 20+                             |

---

## Project Structure

```
voicecraft/
├── apps/
│   ├── web/          # Next.js 16 — frontend + REST API + builder
│   └── agent/        # Python — LiveKit voice agent worker
├── packages/
│   ├── config/       # Shared Tailwind, TypeScript, ESLint configs
│   └── db/           # Prisma schema + client (@voicecraft/db)
├── docker-compose.yml
├── Makefile
├── package.json      # Monorepo root
└── pnpm-workspace.yaml
```

---

## Monorepo

- Workspaces are declared in `pnpm-workspace.yaml` at the repo root.
- Shared configs (Tailwind, TypeScript, ESLint) live in `packages/config` as `@voicecraft/config`.
- New apps go under `apps/`, new shared packages go under `packages/`.
- Run `pnpm install` from the repo root to install all workspace dependencies at once.

---

## Design System

### Color Tokens

All colors are defined as RGB triplets in `globals.css` so Tailwind can apply alpha modifiers (`/50`, etc.).

| Token        | Variable             | Default Value          | Usage                     |
|--------------|----------------------|------------------------|---------------------------|
| `cream`      | `--color-cream`      | `247 244 238`          | Page background            |
| `ink`        | `--color-ink`        | `26 24 20`             | Primary text               |
| `muted`      | `--color-muted`      | `122 117 108`          | Secondary / placeholder    |
| `border`     | `--color-border`     | `226 221 213`          | Borders and dividers       |
| `accent`     | `--color-accent`     | `109 70 220` (violet)  | CTAs, links, highlights    |
| `success`    | `--color-success`    | `45 106 79`            | Success states             |
| `white`      | `--color-white`      | `255 255 255`          | High-contrast surfaces     |

Use Tailwind utilities: `bg-cream`, `text-ink`, `text-muted`, `border-border`, `text-accent`, etc.

### Typography

- **Headings** → `font-serif` → Lora (via `--font-heading`)
- **Body** → `font-sans` → Source Sans 3 (via `--font-body`)
- Body is set globally on `<body>` via `font-sans bg-cream text-ink antialiased`.

### Border Radius

Controlled by `--radius: 8px`. Scale: `rounded-sm`, `rounded` / `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`.

---

## Conventions

### File & Folder Naming
- Route segments: lowercase with hyphens (`my-page/`)
- Components: PascalCase (`MyComponent.tsx`)
- Utilities / hooks: camelCase (`useMyHook.ts`, `utils.ts`)
- All source lives under `src/`

### Path Alias
Use `@/` as an alias for `src/`:
```ts
import { cn } from '@/lib/utils'
```

### Component Style
- Build components from scratch with Tailwind — no pre-built UI library.
- Keep components small and single-purpose.
- Use `cn()` from `@/lib/utils` to compose conditional class names.

### Server vs Client Components
- Default to **Server Components**.
- Add `'use client'` only when the component needs interactivity (state, effects, browser APIs).

### No `any`
Strict TypeScript is enabled. Do not use `any` — use `unknown` and narrow types properly.

---

## Database

PostgreSQL via Prisma, shared as `@voicecraft/db`.

| Concern | Location |
|---|---|
| Schema | `packages/db/prisma/schema.prisma` |
| Client singleton | `packages/db/src/index.ts` |
| Seed script | `packages/db/prisma/seed.ts` |

**Models:** User, Agent, Call, Appointment, BuilderConversation, Integration

**Usage:** `import { prisma } from '@voicecraft/db'`

**After schema changes:** Run `make db-generate` (or `cd packages/db && npx prisma generate`).

---

## Authentication

NextAuth v5 (Auth.js) with Credentials provider, JWT sessions, DB-backed user lookup.

| Concern | Location | Notes |
|---|---|---|
| Config | `src/auth.ts` | Credentials provider, Prisma user lookup |
| Route protection | `src/middleware.ts` | Guards `/dashboard/*` |
| Login page | `src/app/login/` | Server action → redirects to `/dashboard` |
| Components | `src/components/auth/` | `LoginForm`, `SignOutButton` |
| Session provider | `src/components/providers/SessionProvider.tsx` | Wraps app in root layout |

**Reading the session:**
- Server Components: `import { auth } from '@/auth'` then `const session = await auth()`
- Client Components: `useSession()` from `next-auth/react`

**Demo credentials:** `admin@voicecraft.dev` / `password123` (seeded via `make db-seed`)

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/agents` | GET, POST | List/create agents |
| `/api/agents/[id]` | GET, PUT, DELETE | Agent CRUD |
| `/api/agents/[id]/deploy` | POST | Deploy agent (set ACTIVE) |
| `/api/builder/message` | POST | Chat with Claude Sonnet builder |
| `/api/builder/generate` | POST | Generate agent config from conversation |
| `/api/calls` | GET, POST | List/log calls |
| `/api/webhooks/availability` | POST | Check appointment slots (Google Cal or mock) |
| `/api/webhooks/book` | POST | Book appointment |
| `/api/webhooks/send-sms` | POST | Send SMS (Twilio or mock) |
| `/api/livekit/token` | POST | Generate LiveKit room token |
| `/api/integrations/google` | GET | Google Calendar OAuth flow |
| `/api/integrations/google/callback` | GET | OAuth callback |

Session-authenticated routes use `auth()`. Webhook routes use `x-api-key` header with `VOICECRAFT_API_KEY`.

---

## Commands

```bash
# From monorepo root
make dev            # Start all services (Docker: Postgres + web + agent)
pnpm dev            # Start web only (local, needs local Postgres)
pnpm build          # Build apps/web
pnpm lint           # Lint all workspaces
pnpm type-check     # Type-check all workspaces

# Database
make db-migrate     # Run Prisma migrations
make db-seed        # Seed demo user
make db-studio      # Open Prisma Studio
make db-generate    # Generate Prisma client

# Target a specific workspace
pnpm --filter @voicecraft/web <script>

# Python agent (from apps/agent/)
uv sync             # Install Python dependencies
uv run python -m src.agent.worker start
uv run pytest tests/ -v
```

---

## Environment Variables

Stored in `.env.local` (web) and `.env` (agent). Not committed. See `.env.example` files for templates.

**Required (web):** `DATABASE_URL`, `AUTH_SECRET`
**Optional (web):** `ANTHROPIC_API_KEY`, `LIVEKIT_*`, `VOICECRAFT_API_KEY`, `GOOGLE_CLIENT_*`, `TWILIO_*`
**Required (agent):** `LIVEKIT_*`, `DEEPGRAM_API_KEY`, `GOOGLE_API_KEY`

---

## Adding New Routes

1. Create a folder under `src/app/` — e.g., `src/app/dashboard/`
2. Add `page.tsx` (required), optionally `layout.tsx`, `loading.tsx`, `error.tsx`
3. For API routes, add `route.ts` inside the folder

## Adding New Components

Place shared components in `src/components/`. Group by domain:
```
src/components/
  ui/          # Pure presentational atoms (Button, Input, Badge…)
  layout/      # Sidebar
  auth/        # LoginForm, SignOutButton
  builder/     # BuilderChat, ChatMessage, ConfigPreview
  agents/      # TestCallClient
  providers/   # SessionProvider
```

---

## Working Conventions

- **README.md must stay in sync** — update it whenever anything is created or changed (new routes, packages, config, dependencies, structural decisions).
- **No Co-Authored-By in commits** — omit the Claude co-authorship trailer from all commit messages.
- **Delegate to agents** — use Claude Code subagents (senior-frontend-engineer, senior-backend-architect, technical-writer, qa-engineer, etc.) for non-trivial tasks; run independent agents in parallel.
