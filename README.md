# VoiceCraft

VoiceCraft is a voice AI platform for small and medium businesses. It lets you build, deploy, and monitor AI voice agents that handle appointment booking, availability checks, and WhatsApp confirmations — all from a web dashboard.

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

Postgres via Prisma with the following models: `User`, `Agent`, `Call`, `Appointment`, `BuilderConversation`, `Integration`, `PhoneNumber`.

### API Routes

| Route | Purpose |
|---|---|
| `POST /api/agents`, `GET /api/agents`, `PATCH /api/agents/[id]`, `DELETE /api/agents/[id]` | Agent CRUD |
| `POST /api/builder/message`, `POST /api/builder/generate` | Chat with Claude to configure agents |
| `POST /api/calls`, `GET /api/calls` | Call logging |
| `POST /api/webhooks/availability` | Check calendar availability (called by voice agent) |
| `POST /api/webhooks/book` | Book appointments (called by voice agent) |
| `POST /api/webhooks/twilio-whatsapp` | Inbound WhatsApp message handler |
| `POST /api/webhooks/twilio-whatsapp-status` | WhatsApp sender approval and opt-out events |
| `POST /api/agents/[id]/whatsapp` | Enable WhatsApp on an agent's number |
| `DELETE /api/agents/[id]/whatsapp` | Disable WhatsApp |
| `POST /api/cron/appointment-reminders` | Hourly cron — sends WhatsApp 24h reminders (bearer token protected) |
| `POST /api/webhooks/twilio-voice` | Inbound call routing — returns TwiML to forward calls to LiveKit |
| `POST /api/agents/[id]/provision-number` | Assign a pooled number to an agent or release it back to the pool |
| `GET /api/phone-numbers` | List user's available pool numbers |
| `POST /api/phone-numbers/reassign` | Move a number between the user's agents |
| `POST /api/phone-numbers/cleanup` | Trigger stale number cleanup (API-key protected) |
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
- **Tools** — function calls that hit the Next.js webhook API to check availability, book appointments, and send WhatsApp confirmations

### Authentication

VoiceCraft uses NextAuth v5 with:

- **Email/password signup** — with email verification via Resend
- **Google OAuth** — one-click sign-in, no email verification required
- **Password reset** — via emailed link (1-hour expiry)

Demo credentials (seeded): `admin@voicecraft.dev` / `password123`

**Required env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`

### Integrations

- Google Calendar (read availability, create bookings)
- Twilio WhatsApp (send booking confirmations and 24h appointment reminders via WhatsApp)

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
| `AUTH_URL` | Public base URL for NextAuth (e.g. `https://app.example.com`) |
| `ANTHROPIC_API_KEY` | Claude Sonnet for the agent builder |
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_SIP_DOMAIN` | LiveKit SIP domain (from dashboard, e.g. `xxxxx.sip.livekit.cloud`) |
| `LIVEKIT_SIP_USERNAME` | SIP auth username for LiveKit inbound trunks |
| `LIVEKIT_SIP_PASSWORD` | SIP auth password for LiveKit inbound trunks |
| `VOICECRAFT_API_KEY` | Shared secret for agent-to-web authentication |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (Calendar integration + Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for email verification and password reset emails |
| `EMAIL_FROM` | Sender address for transactional emails (e.g. `noreply@voicecraft.dev`) |
| `APP_URL` | Public base URL used in email links (e.g. `http://localhost:3000`) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (enables phone provisioning) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WA_CONFIRMATION_SID` | Meta-approved WhatsApp template SID for booking confirmations (optional) |
| `TWILIO_WA_REMINDER_SID` | Meta-approved WhatsApp template SID for appointment reminders (optional) |
| `CRON_SECRET` | Bearer token for authenticating `POST /api/cron/appointment-reminders` |
| `NEXT_PUBLIC_APP_URL` | Base URL (e.g. `http://localhost:3000`) |

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
| `TTS_PROVIDER` | TTS provider: `openai` (default) or `elevenlabs` |
| `TTS_VOICE` | OpenAI TTS voice (default: `alloy`) |
| `TTS_MODEL` | OpenAI TTS model (default: `gpt-4o-mini-tts`) |
| `OPENAI_API_KEY` | OpenAI API key (required when TTS_PROVIDER=openai) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (required when TTS_PROVIDER=elevenlabs) |

---

## Twilio Setup

VoiceCraft uses a single platform Twilio account to provision phone numbers for all customers and send WhatsApp messages. Customers never need their own Twilio accounts.

### 1. Create a Twilio account

Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio). A free trial account works for development.

### 2. Get your credentials

From the [Twilio Console](https://console.twilio.com/) dashboard, copy:

- **Account SID** — starts with `AC`
- **Auth Token** — click to reveal

### 3. Add to your environment

In `apps/web/.env.local`:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
```

With just these two variables, **one-click phone number provisioning** is enabled in the dashboard. VoiceCraft maintains a pool of Twilio numbers and assigns them to agents on demand — numbers are recycled back to the pool when an agent is deleted rather than released from Twilio, reducing provisioning costs and latency.

### 4. SIP credentials for call routing

When a customer deploys an agent, VoiceCraft needs to route inbound calls from Twilio to LiveKit. This requires a shared set of SIP credentials used across all agents:

```bash
LIVEKIT_SIP_USERNAME=voicecraft
LIVEKIT_SIP_PASSWORD=generate-a-strong-password
```

You choose these values — they just need to match between the LiveKit inbound trunk and the TwiML that Twilio sends. VoiceCraft handles the rest automatically.

**How call routing works:**

```
Caller → Twilio number → POST /api/webhooks/twilio-voice
  → looks up agent by called number
  → returns TwiML: <Dial><Sip> to LiveKit SIP endpoint
  → LiveKit inbound trunk (same SIP credentials) accepts the call
  → dispatch rule routes to agent worker
```

All numbers share one webhook endpoint. No per-number configuration to manage.

### 5. WhatsApp messaging (optional)

VoiceCraft operates as a WhatsApp Tech Provider (ISV) under Twilio's WAISV program. Each agent's provisioned phone number handles both voice calls and WhatsApp messages — no second number needed.

To enable WhatsApp messaging:

1. Register as a WhatsApp ISV in the Twilio Console under **Messaging → WhatsApp → Senders**
2. Create two Meta-approved message templates (confirmation and reminder) in your Twilio Content Editor
3. Add the template SIDs and a cron secret to your environment:

```bash
TWILIO_WA_CONFIRMATION_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WA_REMINDER_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CRON_SECRET=generate-a-strong-secret
```

Once configured, business owners can enable WhatsApp per agent from the agent detail page. Customers can then WhatsApp the agent's number directly.

**Appointment reminders** are sent automatically ~24 hours before each appointment. Trigger the cron job hourly:
- **Vercel**: set `CRON_SECRET` in project settings — Vercel cron runner sends it automatically
- **Self-hosted**: `make cron-reminders` (uses `CRON_SECRET` from your shell environment)

### 6. Trial account limitations

Twilio trial accounts can only call [verified numbers](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account). To test with real calls, upgrade to a paid account or verify the numbers you'll call from.

### What customers see

| Platform config | Dashboard experience |
|---|---|
| `ACCOUNT_SID` + `AUTH_TOKEN` set | "Get a phone number" button — one click provisioning |
| Not set | Manual phone number input field |

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
AUTH_URL=https://<your-railway-domain>.up.railway.app
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
