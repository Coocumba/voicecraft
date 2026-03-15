FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# ── deps: install all workspace dependencies ──────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy manifests + prisma schema for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/db/prisma ./packages/db/prisma
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile && \
    cd packages/db && npx prisma generate

# ── dev: local development with hot reload ────────────────────────────────────
FROM base AS dev
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/web
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["pnpm", "dev"]

# ── builder: production build ─────────────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml ./

# Dummy env vars for build — Next.js needs these at compile time but
# the real values are injected at runtime by Railway / docker-compose
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV AUTH_SECRET="build-time-placeholder"
ENV AUTH_TRUST_HOST="true"
RUN pnpm --filter @voicecraft/web build && \
    cp -r apps/web/.next/static apps/web/.next/standalone/.next/static && \
    mkdir -p apps/web/public && \
    cp -r apps/web/public apps/web/.next/standalone/public 2>/dev/null || true

# ── runner: minimal production image ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p ./public

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
# Public dir may be empty — create it in advance so COPY never fails
COPY --from=builder /app/apps/web/public/ ./public/

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
