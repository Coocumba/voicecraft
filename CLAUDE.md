# VoiceCraft — Claude Code Guide

## Project Overview

VoiceCraft is a Next.js 16 application built with the App Router, TypeScript, and Tailwind CSS. The design system mirrors the HelpNest editorial theme: warm cream backgrounds, serif headings, and a clean sans-serif body.

---

## Tech Stack

| Layer       | Choice                              |
|-------------|-------------------------------------|
| Framework   | Next.js 16 (App Router)             |
| Language    | TypeScript (strict mode)            |
| Styling     | Tailwind CSS v3 + CSS variables     |
| Fonts       | Lora (serif) + Source Sans 3 (sans) |
| Toasts      | Sonner                              |
| Auth        | NextAuth v5 (Auth.js)               |
| Runtime     | Node.js 20+                         |

---

## Project Structure

```
voicecraft/
├── apps/
│   ├── web/          # Next.js 16 — frontend + REST API
│   └── agent/        # Python — LiveKit voice agent worker
├── packages/
│   └── config/       # Shared Tailwind, TypeScript, ESLint configs
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

## Authentication

NextAuth v5 (Auth.js) with a Credentials provider and JWT sessions.

| Concern | Location | Notes |
|---|---|---|
| Config | `src/auth.ts` | Credentials provider with JWT sessions |
| Route protection | `src/middleware.ts` | Guards `/dashboard/*` |
| Login page | `src/app/login/` | Server action → redirects to `/dashboard` on success |
| Components | `src/components/auth/` | `LoginForm`, `SignOutButton` |

**Reading the session:**
- Server Components: `import { auth } from '@/auth'` then `const session = await auth()`
- Client Components: `useSession()` from `next-auth/react`

**Demo credentials:** `admin@voicecraft.dev` / `password123`

**Adding OAuth providers (Google, GitHub, etc.):** add them to the `providers` array in `src/auth.ts`. See the [Auth.js provider docs](https://authjs.dev/reference/core/providers).

---

## Commands

```bash
# From monorepo root
pnpm dev            # Start apps/web dev server
pnpm build          # Build apps/web
pnpm lint           # Lint all workspaces
pnpm type-check     # Type-check all workspaces

# Target a specific workspace
pnpm --filter @voicecraft/web <script>

# Python agent (from apps/agent/)
uv sync             # Install Python dependencies
uv run uvicorn src.api.main:app --reload --port 8000
uv run python -m src.agent.worker start
uv run pytest tests/ -v
```

---

## Environment Variables

Stored in `.env.local` (not committed). Prefix with `NEXT_PUBLIC_` for client-side access.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=VoiceCraft
```

---

## Adding New Routes

1. Create a folder under `src/app/` — e.g., `src/app/dashboard/`
2. Add `page.tsx` (required), optionally `layout.tsx`, `loading.tsx`, `error.tsx`
3. For API routes, add `route.ts` inside the folder

## Adding New Components

Place shared components in `src/components/`. Group by domain when the folder grows:
```
src/components/
  ui/          # Pure presentational atoms (Button, Input, Badge…)
  layout/      # Header, Sidebar, Footer
  [feature]/   # Feature-specific components
```

---

## Working Conventions

- **README.md must stay in sync** — update it whenever anything is created or changed (new routes, packages, config, dependencies, structural decisions).
- **No Co-Authored-By in commits** — omit the Claude co-authorship trailer from all commit messages.
- **Delegate to agents** — use Claude Code subagents (senior-frontend-engineer, senior-backend-architect, technical-writer, qa-engineer, etc.) for non-trivial tasks; run independent agents in parallel.
