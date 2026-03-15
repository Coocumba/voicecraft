# VoiceCraft

AI-powered voice crafting — Next.js 16 + Python LiveKit agent, in a pnpm monorepo.

---

## Tech Stack

| Layer           | Choice                          |
|-----------------|---------------------------------|
| Framework       | Next.js 16 (App Router)         |
| UI              | React 19                        |
| Language        | TypeScript (strict mode)        |
| Styling         | Tailwind CSS v3 + CSS variables |
| Toasts          | Sonner                          |
| Package manager | pnpm 10 (workspaces)            |
| Voice agent     | Python + LiveKit (managed with uv) |
| Auth            | NextAuth v5 (Auth.js)              | JWT sessions, Credentials provider |

---

## Getting Started

### Prerequisites

- Node.js 20 or later
- pnpm 10 or later (`npm install -g pnpm`)
- Python 3.11 or later + [uv](https://docs.astral.sh/uv/) (for the agent)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/voicecraft.git
cd voicecraft

# Install all workspace dependencies (run from the monorepo root)
pnpm install

# Copy environment variables for the web app
# .env.local is gitignored — never committed. Copy from the checked-in
# template and fill in your own values before starting the server.
cp apps/web/.env.example apps/web/.env.local

# Start the web development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

To set up the Python voice agent:

```bash
cd apps/agent
uv sync
```

---

## Project Structure

```
voicecraft/
├── apps/
│   ├── web/                        # Next.js 16 — frontend + REST API
│   │   └── src/
│   │       ├── auth.ts             # NextAuth configuration
│   │       ├── middleware.ts       # Route protection
│   │       ├── app/
│   │       │   ├── login/          # Login page
│   │       │   └── dashboard/      # Protected dashboard
│   │       └── components/
│   │           └── auth/           # LoginForm, SignOutButton
│   └── agent/                      # Python — LiveKit voice agent worker
├── packages/
│   └── config/                     # Shared Tailwind, TypeScript, ESLint configs
├── package.json                    # Monorepo root
└── pnpm-workspace.yaml
```

---

## Workspaces

| Workspace            | Description                                          |
|----------------------|------------------------------------------------------|
| `@voicecraft/web`    | Next.js app — frontend UI and API routes             |
| `@voicecraft/config` | Shared configs — Tailwind, TypeScript, ESLint        |
| `apps/agent`         | Python LiveKit voice agent, managed with uv          |

---

## Design System

### Color Tokens

All colors are defined as RGB triplets in `globals.css`, which allows Tailwind to apply alpha modifiers (`/50`, `/75`, etc.).

| Token     | CSS Variable         | Default (RGB)         | Usage                   |
|-----------|----------------------|-----------------------|-------------------------|
| `cream`   | `--color-cream`      | `247 244 238`         | Page background         |
| `ink`     | `--color-ink`        | `26 24 20`            | Primary text            |
| `muted`   | `--color-muted`      | `122 117 108`         | Secondary / placeholder |
| `border`  | `--color-border`     | `226 221 213`         | Borders and dividers    |
| `accent`  | `--color-accent`     | `109 70 220` (violet) | CTAs, links, highlights |
| `success` | `--color-success`    | `45 106 79`           | Success states          |
| `white`   | `--color-white`      | `255 255 255`         | High-contrast surfaces  |

Use the tokens via Tailwind utilities: `bg-cream`, `text-ink`, `text-muted`, `border-border`, `text-accent`, and so on.

### Typography

| Role     | Tailwind class | Font          | CSS variable    |
|----------|----------------|---------------|-----------------|
| Headings | `font-serif`   | Lora          | `--font-heading` |
| Body     | `font-sans`    | Source Sans 3 | `--font-body`   |

Body defaults (`font-sans bg-cream text-ink antialiased`) are applied globally on the `<body>` element in `layout.tsx`.

### Border Radius

Base radius is controlled by `--radius: 8px`. Use the standard Tailwind scale: `rounded-sm`, `rounded` / `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`.

---

## Environment Variables

Copy `.env.example` to `.env.local` before running the app. The `.env.local` file is not committed to version control.

| Variable               | Description                              |
|------------------------|------------------------------------------|
| `NEXT_PUBLIC_APP_URL`  | Base URL of the app (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_NAME` | Display name of the app (e.g. `VoiceCraft`)        |
| `AUTH_SECRET`          | Required. Secret key for signing JWT tokens. Generate with `openssl rand -base64 32` |
| `AUTH_TRUST_HOST`      | Set to `true` for non-Vercel deployments (Railway, Docker) |

Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

---

## Scripts

### Root (runs across all workspaces)

| Command            | Description                                    |
|--------------------|------------------------------------------------|
| `pnpm dev`         | Start the `apps/web` development server (Turbopack) |
| `pnpm build`       | Build `apps/web` for production                |
| `pnpm lint`        | Lint all workspaces                            |
| `pnpm type-check`  | Type-check all workspaces                      |

### Target a specific workspace

```bash
pnpm --filter @voicecraft/web <script>
```

### Python agent (run from `apps/agent/`)

| Command                                                | Description                        |
|--------------------------------------------------------|------------------------------------|
| `uv sync`                                              | Install Python dependencies        |
| `uv run uvicorn src.api.main:app --reload --port 8000` | Start the agent API server         |
| `uv run python -m src.agent.worker start`              | Start the LiveKit voice agent      |
| `uv run pytest tests/ -v`                              | Run the Python test suite          |

---

## Monorepo

The monorepo is set up and ready to extend:

- Workspaces are declared in `pnpm-workspace.yaml` at the repo root.
- Shared configs (Tailwind, TypeScript, ESLint) live in `packages/config` as `@voicecraft/config`.
- Add new applications under `apps/` and new shared packages under `packages/`.
- Run `pnpm install` from the repo root to install all workspace dependencies at once.

---

## Local Development (Docker)

Running the full stack locally requires only Docker — no Node.js or Python installation needed on the host.

### First-time setup

```bash
# First time (generates lock files + copies env templates)
make setup

# Start everything
make dev

# Or run in background
make dev-detach
```

### Common commands

| Command | Description |
|---|---|
| `make dev` | Setup + start all services |
| `make down` | Stop all services |
| `make reset` | Stop and wipe volumes |
| `make rebuild` | Force rebuild after dep changes |
| `make logs` | Follow all logs |
| `make lock` | Regenerate uv.lock |
| `make help` | Show all commands |

> After changing `apps/agent/pyproject.toml`, run `make lock` and commit `uv.lock` to keep production builds deterministic.

### Services

| Service | Local URL | Hot reload |
|---|---|---|
| web (Next.js) | http://localhost:3000 | Yes (src/ volume) |
| api (FastAPI) | http://localhost:8000 | Yes (--reload) |
| agent (LiveKit) | — background worker | Yes (volume) |

The `web` service uses the `dev` build target from `apps/web/Dockerfile`, which runs `pnpm dev` with Turbopack. Source changes under `apps/web/src/` and `apps/web/public/` are reflected immediately via volume mounts. Dependencies are baked into the Docker image at build time — run `docker compose up --build` after changing `package.json`.

The `api` and `agent` services both use the `runner` stage from `apps/agent/Dockerfile`. The compose file overrides the default `CMD` to add `--reload` (for `api`) and mounts `apps/agent/src/` so Python changes are picked up without a rebuild.

---

## Deployment

### Deploying to Railway

**Prerequisites:** Railway account, repo pushed to GitHub.

**Steps:**

1. Create a new Railway project from your GitHub repo.
2. Add two services — both pointing to the same repo:

**Service: web**

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Config file | `apps/web/railway.toml` (auto-detected) |

Required environment variables:

```
NEXT_PUBLIC_APP_URL=https://<your-railway-domain>.up.railway.app
NEXT_PUBLIC_APP_NAME=VoiceCraft
```

**Service: agent**

| Setting | Value |
|---|---|
| Root Directory | `apps/agent` |
| Config file | `apps/agent/railway.toml` (auto-detected) |

Required environment variables: copy from `apps/agent/.env.example`.

3. Railway auto-detects `railway.toml` in the service root and deploys.

Note: `railway.toml` in each app directory tells Railway to use the Dockerfile builder. The web service build context is the monorepo root (required for pnpm workspace resolution); the agent service build context is `apps/agent/`.
