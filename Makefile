.DEFAULT_GOAL := help

# ── colours ───────────────────────────────────────────────────────────────────
BOLD  := $(shell tput bold 2>/dev/null)
RESET := $(shell tput sgr0 2>/dev/null)
GREEN := $(shell tput setaf 2 2>/dev/null)

# ── help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'

# ── setup ─────────────────────────────────────────────────────────────────────
.PHONY: setup
setup: ## First-time setup: generate lock files and copy env templates
	@echo "$(BOLD)Setting up VoiceCraft...$(RESET)"

	@# Generate uv.lock if missing
	@if [ ! -f apps/agent/uv.lock ]; then \
		echo "  -> Generating apps/agent/uv.lock"; \
		cd apps/agent && uv lock; \
	else \
		echo "  + apps/agent/uv.lock exists"; \
	fi

	@# Copy env templates if .env files are missing
	@if [ ! -f apps/agent/.env ]; then \
		cp apps/agent/.env.example apps/agent/.env; \
		echo "  -> Created apps/agent/.env (fill in your API keys)"; \
	else \
		echo "  + apps/agent/.env exists"; \
	fi

	@if [ ! -f apps/web/.env.local ]; then \
		printf 'NEXT_PUBLIC_APP_URL=http://localhost:3000\nNEXT_PUBLIC_APP_NAME=VoiceCraft\nDATABASE_URL=postgresql://voicecraft:voicecraft@localhost:5432/voicecraft\n' > apps/web/.env.local; \
		echo "  -> Created apps/web/.env.local"; \
	else \
		echo "  + apps/web/.env.local exists"; \
	fi

	@echo "$(GREEN)Setup complete. Edit apps/agent/.env with your API keys, then run: make dev$(RESET)"

# ── dev ───────────────────────────────────────────────────────────────────────
.PHONY: dev
dev: setup ## Start all services (runs setup first)
	docker compose up --build

.PHONY: dev-detach
dev-detach: setup ## Start all services in background
	docker compose up --build -d

# ── database ──────────────────────────────────────────────────────────────────
.PHONY: db-migrate
db-migrate: ## Run Prisma migrations
	cd packages/db && pnpm db:migrate

.PHONY: db-seed
db-seed: ## Seed the database with demo data
	cd packages/db && pnpm db:seed

.PHONY: db-studio
db-studio: ## Open Prisma Studio
	cd packages/db && pnpm db:studio

.PHONY: db-generate
db-generate: ## Generate Prisma client
	cd packages/db && pnpm db:generate

# ── logs ──────────────────────────────────────────────────────────────────────
.PHONY: logs
logs: ## Follow logs for all services
	docker compose logs -f

.PHONY: logs-web
logs-web: ## Follow web service logs
	docker compose logs -f web

.PHONY: logs-agent
logs-agent: ## Follow agent worker logs
	docker compose logs -f agent

# ── control ───────────────────────────────────────────────────────────────────
.PHONY: down
down: ## Stop all services
	docker compose down

.PHONY: reset
reset: ## Stop all services and remove volumes (full clean slate)
	docker compose down -v

.PHONY: rebuild
rebuild: ## Force rebuild all images (after dependency changes)
	docker compose up --build --force-recreate

# ── deps ──────────────────────────────────────────────────────────────────────
.PHONY: lock
lock: ## Regenerate uv.lock after changing pyproject.toml
	cd apps/agent && uv lock
	@echo "$(GREEN)Lock file updated. Commit uv.lock to keep builds reproducible.$(RESET)"

.PHONY: install
install: ## Install JS dependencies (pnpm)
	pnpm install
