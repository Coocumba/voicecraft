FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# LiveKit's native FFI library requires GLib and GObject
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgobject-2.0-0 \
        libgstreamer1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# -- builder -------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Support both build contexts:
#   docker-compose: context = apps/agent (files at .)
#   Railway:        context = repo root   (files at apps/agent/)
COPY pyproject.tom[l] uv.loc[k] ./
COPY apps/agent/pyproject.tom[l] apps/agent/uv.loc[k] ./apps/agent/
RUN if [ -f apps/agent/pyproject.toml ]; then \
      cp apps/agent/pyproject.toml apps/agent/uv.lock .; \
    fi

RUN uv sync --frozen --no-install-project --no-dev

COPY sr[c] ./src/
COPY apps/agent/sr[c] ./apps/agent/src/
RUN if [ -d apps/agent/src ]; then \
      rm -rf src && cp -r apps/agent/src .; \
    fi

RUN uv sync --frozen --no-dev

# -- runner --------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src ./src

ENV PATH="/app/.venv/bin:$PATH"

CMD ["python", "-m", "src.agent.worker", "start"]
