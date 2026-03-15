# VoiceCraft

VoiceCraft is a voice AI platform for small and medium businesses, starting with dental clinics. It lets you build, deploy, and monitor AI voice agents that handle appointment booking, availability checks, and SMS confirmations — all from a web dashboard.

The monorepo contains a Next.js web app (frontend + REST API + agent builder) and a Python LiveKit voice agent worker.

---

## Tech Stack

| Layer           | Choice                                          |
|-----------------|-------------------------------------------------|
| Framework       | Next.js 16 (App Router)                         |
| Language        | TypeScript (strict mode)                        |
| Styling         | Tailwind CSS v3 + CSS variables                 |
| Database        | PostgreSQL + Prisma                             |
| Auth            | NextAuth v5 (Auth.js) — JWT sessions            |
| Voice agent     | LiveKit + Deepgram Nova-3 + Gemini Flash + ElevenLabs |
| Builder LLM     | Claude Sonnet (Anthropic SDK)                   |
| Package manager | pnpm 10 (workspaces)                            |
| Python runtime  | uv                                              |

---

## Project Structure

```
voicecraft/
├── apps/
│   ├── web/                        # Next.js 16 — frontend + REST API + agent builder
│   │   └── src/
│   │       ├── auth.ts             # NextAuth configuration
│   │       ├── middleware.ts       # Route protection (/dashboard/*)
│   │       ├── app/
│   │       │   ├── login/          # Login page
│   │       │   ├── dashboard/      # Protected dashboard (agents, calls, settings)
│   │       │   └── api/            # REST API routes
│   │       └── components/         # UI components
│   └── agent/                      # Python — LiveKit voice agent worker
├── packages/
│   ├── config/                     # Shared Tailwind, TypeScript, ESLint configs
│   └── db/                         # Prisma schema + client (@voicecraft/db)
├── docker-compose.yml
├── Makefile
└── pnpm-workspace.yaml
```

---

## Workspaces

| Workspace            | Description                                             |
|----------------------|---------------------------------------------------------|
| `@voicecraft/web`    | Next.js app — dashboard UI, REST API, agent builder     |
| `@voicecraft/db`     | Prisma schema + generated client, shared across apps    |
| `@voicecraft/config` | Shared configs — Tailwind, TypeScript, ESLint           |
| `apps/agent`         | Python LiveKit voice agent worker, managed with uv      |

---

## What's Built

### Database

Postgres via Prisma with the following models: `User`, `Agent`, `Call`, `Appointment`, `BuilderConversation`, `Integration`.

### API Routes

| Route | Purpose |
|---|---|
| `POST /api/agents`, `GET /api/agents`, `PATCH /api/agents/[id]`, `DELETE /api/agents/[id]` | Agent CRUD |
| `POST /api/builder/message`, `POST /api/builder/generate` | Chat with Claude to configure agents |
| `POST /api/calls`, `GET /api/calls` | Call logging |
| `POST /api/webhooks/availability` | Check calendar availability (called by voice agent) |
| `POST /api/webhooks/book` | Book appointments (called by voice agent) |
| `POST /api/webhooks/send-sms` | Send SMS confirmations via Twilio |
| `GET /api/livekit/token` | Generate LiveKit room tokens |
| `GET /api/integrations/google` | Google Calendar OAuth callback |

### Dashboard

- Overview with call and agent stats
- Agent list with live status badges
- Agent builder — chat with Claude to configure an agent's behavior
- Agent detail view with full call history
- Test call page
- Settings page

### Voice Agent

The Python worker runs as a LiveKit `VoicePipelineAgent` with:

- **STT** — Deepgram Nova-3
- **LLM** — Google Gemini Flash
- **TTS** — ElevenLabs (with Google TTS fallback)
- **Tools** — function calls that hit the Next.js webhook API to check availability, book appointments, and send SMS

### Integrations

- Google Calendar (read availability, create bookings)
- Twilio SMS (send confirmation messages, with mock fallback for local development)

---

## Getting Started

### Prerequisites

- Node.js 20 or later
- pnpm 10 or later (`npm install -g pnpm`)
- Docker and Docker Compose (for the full local stack)
- Python 3.11 or later + [uv](https://docs.astral.sh/uv/) (for running the agent directly)

### First-time setup

```bash
# Clone the repository
git clone https://github.com/your-org/voicecraft.git
cd voicecraft

# First-time setup: generates lock files, copies env templates
make setup

# Start all services (web, api, agent, Postgres)
make dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Demo credentials:** `admin@voicecraft.dev` / `password123`

### Running without Docker

```bash
# Install JS dependencies
pnpm install

# Copy and fill in environment variables for the web app
cp apps/web/.env.example apps/web/.env.local

# Run database migrations and seed the demo user
make db-migrate
make db-seed

# Start the web dev server
pnpm dev
```

For the Python agent:

```bash
cd apps/agent
cp .env.example .env   # fill in your keys
uv sync
uv run python -m src.agent.worker start
```

---

## Environment Variables

### apps/web (.env.local)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret — generate with `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | Claude Sonnet for the agent builder |
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `VOICECRAFT_API_KEY` | Shared secret for agent-to-web authentication |
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth client secret |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number |
| `NEXT_PUBLIC_APP_URL` | Base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_NAME` | Display name (e.g. `VoiceCraft`) |

### apps/agent (.env)

| Variable | Description |
|---|---|
| `VOICECRAFT_WEB_URL` | Next.js API base URL |
| `VOICECRAFT_API_KEY` | Shared secret (must match the web app value) |
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `DEEPGRAM_API_KEY` | Deepgram STT key |
| `GOOGLE_API_KEY` | Gemini LLM key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS key |

---

## Commands

### Make (full stack via Docker)

| Command | Description |
|---|---|
| `make setup` | First-time setup |
| `make dev` | Start all services |
| `make down` | Stop all services |
| `make reset` | Stop and wipe volumes |
| `make rebuild` | Force rebuild after dependency changes |
| `make logs` | Follow all service logs |
| `make db-migrate` | Run Prisma migrations |
| `make db-seed` | Seed the demo user |
| `make db-studio` | Open Prisma Studio |
| `make db-generate` | Regenerate Prisma client |
| `make lock` | Regenerate uv.lock (run after changing pyproject.toml) |
| `make help` | Show all available commands |

### pnpm (web app)

| Command | Description |
|---|---|
| `pnpm dev` | Start the web dev server |
| `pnpm build` | Production build |
| `pnpm type-check` | TypeScript check across all workspaces |
| `pnpm lint` | Lint all workspaces |

Target a specific workspace:

```bash
pnpm --filter @voicecraft/web <script>
```

### Python agent (from apps/agent/)

| Command | Description |
|---|---|
| `uv sync` | Install Python dependencies |
| `uv run python -m src.agent.worker start` | Start the LiveKit voice agent |
| `uv run uvicorn src.api.main:app --reload --port 8000` | Start the agent API server |
| `uv run pytest tests/ -v` | Run the Python test suite |

---

## Local Services

| Service | URL | Hot reload |
|---|---|---|
| web (Next.js) | http://localhost:3000 | Yes (src/ volume mount) |
| api (FastAPI) | http://localhost:8000 | Yes (--reload flag) |
| agent (LiveKit worker) | background process | Yes (volume mount) |

After changing `apps/agent/pyproject.toml`, run `make lock` and commit the updated `uv.lock` to keep production builds deterministic.

---

## Deployment

### Railway

**Prerequisites:** Railway account, repository pushed to GitHub.

1. Create a new Railway project from your GitHub repo.
2. Add two services — both pointing to the same repo.

**Service: web**

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Config file | `apps/web/railway.toml` (auto-detected) |

Set all variables from the `apps/web` environment table above, plus:

```
NEXT_PUBLIC_APP_URL=https://<your-railway-domain>.up.railway.app
AUTH_TRUST_HOST=true
```

**Service: agent**

| Setting | Value |
|---|---|
| Root Directory | `apps/agent` |
| Config file | `apps/agent/railway.toml` (auto-detected) |

Set all variables from the `apps/agent` environment table above.

3. Railway auto-detects `railway.toml` in each service root and deploys using the Dockerfile. The web service build context is the monorepo root (required for pnpm workspace resolution).

---

## Design System

Colors are defined as RGB triplets in `globals.css`, which lets Tailwind apply alpha modifiers (`/50`, `/75`, etc.).

| Token | CSS Variable | Default (RGB) | Usage |
|---|---|---|---|
| `cream` | `--color-cream` | `247 244 238` | Page background |
| `ink` | `--color-ink` | `26 24 20` | Primary text |
| `muted` | `--color-muted` | `122 117 108` | Secondary / placeholder |
| `border` | `--color-border` | `226 221 213` | Borders and dividers |
| `accent` | `--color-accent` | `109 70 220` | CTAs, links, highlights |
| `success` | `--color-success` | `45 106 79` | Success states |
| `white` | `--color-white` | `255 255 255` | High-contrast surfaces |

**Typography:** headings use `font-serif` (Lora), body uses `font-sans` (Source Sans 3). Base styles (`font-sans bg-cream text-ink antialiased`) are applied globally on `<body>`.
