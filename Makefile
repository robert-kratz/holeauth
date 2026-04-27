# =============================================================================
# holeauth — Makefile
# =============================================================================
# Convenience wrapper around pnpm / turbo / docker for the holeauth monorepo.
#
# Usage:
#   make help                 # list all targets
#   make install              # install dependencies (pnpm)
#   make dev                  # run all dev tasks (turbo --parallel)
#   make playground           # run the full playground app (db + next)
#   make client-playground    # run the client-playground app
#   make docs                 # run the Fumadocs docs site
#   make test                 # run all tests across the monorepo
#   make build                # build everything
#   make package PKG=core     # run a script for a single package, e.g.
#   make test-pkg PKG=plugin-2fa
# =============================================================================

# -- Config -------------------------------------------------------------------

PNPM           ?= pnpm
TURBO          ?= $(PNPM) exec turbo
NODE_BIN       := $(shell command -v node 2>/dev/null)

# Workspace filters
APP_PLAYGROUND        := playground
APP_CLIENT_PLAYGROUND := client-playground
APP_DOCS              := docs

PACKAGES := \
	core \
	adapter-drizzle \
	nextjs \
	react \
	plugin-2fa 2fa-drizzle \
	plugin-passkey passkey-drizzle \
	plugin-idp idp-drizzle \
	plugin-rbac rbac-drizzle rbac-yaml

APPS := $(APP_PLAYGROUND) $(APP_CLIENT_PLAYGROUND) $(APP_DOCS)

# Single-package selector for generic targets (override on cmdline: PKG=core)
PKG ?=

# Colors
C_RESET := \033[0m
C_BOLD  := \033[1m
C_CYAN  := \033[36m
C_GREEN := \033[32m
C_YEL   := \033[33m

.DEFAULT_GOAL := help

# -- Meta ---------------------------------------------------------------------

.PHONY: help
help: ## Show this help
	@printf "$(C_BOLD)holeauth — Makefile$(C_RESET)\n\n"
	@printf "Usage: $(C_CYAN)make <target>$(C_RESET) [PKG=<package>]\n\n"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_0-9%-]+:.*##/ { \
		printf "  $(C_GREEN)%-26s$(C_RESET) %s\n", $$1, $$2 \
	} /^## / { printf "\n$(C_YEL)%s$(C_RESET)\n", substr($$0, 4) }' $(MAKEFILE_LIST)
	@printf "\nPackages: $(PACKAGES)\n"
	@printf "Apps:     $(APPS)\n\n"

.PHONY: check-pnpm
check-pnpm:
	@command -v $(PNPM) >/dev/null 2>&1 || { \
		echo "pnpm not found. Install via: corepack enable && corepack prepare pnpm@9 --activate"; \
		exit 1; \
	}

## Setup

.PHONY: install
install: check-pnpm ## Install all workspace dependencies
	$(PNPM) install

.PHONY: bootstrap
bootstrap: install ## Run repository bootstrap script
	@if [ -x ./bootstrap.sh ]; then ./bootstrap.sh; else echo "bootstrap.sh not executable, skipping"; fi

.PHONY: clean
clean: ## Clean build outputs across the workspace
	$(TURBO) run clean
	rm -rf node_modules

.PHONY: clean-all
clean-all: ## Full clean incl. all node_modules
	$(TURBO) run clean || true
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name ".turbo" -type d -prune -exec rm -rf '{}' +
	find . -name ".next" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +

## Top-level (turbo)

.PHONY: dev
dev: ## Run dev for the entire workspace (turbo --parallel)
	$(TURBO) run dev --parallel

.PHONY: build
build: ## Build everything
	$(TURBO) run build

.PHONY: build-packages
build-packages: ## Build only library packages
	$(TURBO) run build --filter=./packages/*

.PHONY: build-apps
build-apps: ## Build only apps
	$(TURBO) run build --filter=./apps/*

.PHONY: test
test: ## Run all tests
	$(TURBO) run test

.PHONY: test-packages
test-packages: ## Run tests for packages only
	$(TURBO) run test --filter=./packages/*

.PHONY: lint
lint: ## Lint everything
	$(TURBO) run lint

.PHONY: typecheck
typecheck: ## Typecheck everything
	$(TURBO) run typecheck

.PHONY: format
format: ## Prettier write
	$(PNPM) run format

.PHONY: format-check
format-check: ## Prettier check
	$(PNPM) run format:check

## Apps — playground

.PHONY: playground
playground: ## Run full playground (DB + Next dev server)
	$(PNPM) --filter $(APP_PLAYGROUND) run dev

.PHONY: playground-build
playground-build: ## Build the playground app
	$(PNPM) --filter $(APP_PLAYGROUND) run build

.PHONY: playground-start
playground-start: ## Start production playground
	$(PNPM) --filter $(APP_PLAYGROUND) run start

.PHONY: playground-typecheck
playground-typecheck:
	$(PNPM) --filter $(APP_PLAYGROUND) run typecheck

.PHONY: db-up
db-up: ## Start playground Postgres (docker compose)
	$(PNPM) --filter $(APP_PLAYGROUND) run db:up

.PHONY: db-down
db-down: ## Stop playground Postgres
	$(PNPM) --filter $(APP_PLAYGROUND) run db:down

.PHONY: db-push
db-push: ## drizzle-kit push for playground
	$(PNPM) --filter $(APP_PLAYGROUND) run db:push

.PHONY: db-generate
db-generate: ## drizzle-kit generate for playground
	$(PNPM) --filter $(APP_PLAYGROUND) run db:generate

.PHONY: db-studio
db-studio: ## drizzle-kit studio for playground
	$(PNPM) --filter $(APP_PLAYGROUND) run db:studio

.PHONY: db-seed
db-seed: ## Seed playground DB
	$(PNPM) --filter $(APP_PLAYGROUND) run db:seed

.PHONY: idp-init
idp-init: ## Initialize IDP demo data
	$(PNPM) --filter $(APP_PLAYGROUND) run idp:init

.PHONY: idp-simulate
idp-simulate: ## Run IDP client simulator
	$(PNPM) --filter $(APP_PLAYGROUND) run idp:simulate

## Apps — client-playground

.PHONY: client-playground
client-playground: ## Run client-playground app
	$(PNPM) --filter $(APP_CLIENT_PLAYGROUND) run dev

.PHONY: client-playground-build
client-playground-build:
	$(PNPM) --filter $(APP_CLIENT_PLAYGROUND) run build

.PHONY: client-playground-start
client-playground-start:
	$(PNPM) --filter $(APP_CLIENT_PLAYGROUND) run start

.PHONY: client-db-push
client-db-push: ## drizzle-kit push for client-playground
	$(PNPM) --filter $(APP_CLIENT_PLAYGROUND) run db:push

.PHONY: client-db-bootstrap
client-db-bootstrap: ## Bootstrap client-playground DB
	$(PNPM) --filter $(APP_CLIENT_PLAYGROUND) run db:bootstrap

## Apps — docs

.PHONY: docs
docs: ## Run Fumadocs dev server (port 3001)
	$(PNPM) --filter $(APP_DOCS) run dev

.PHONY: docs-build
docs-build: ## Build the docs site
	$(PNPM) --filter $(APP_DOCS) run build

.PHONY: docs-start
docs-start: ## Start production docs site
	$(PNPM) --filter $(APP_DOCS) run start

## Packages — generic (use PKG=<name>)

.PHONY: pkg-dev
pkg-dev: ## Run dev for a single package: make pkg-dev PKG=core
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run dev

.PHONY: pkg-build
pkg-build: ## Build a single package: make pkg-build PKG=core
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run build

.PHONY: pkg-test
pkg-test: ## Test a single package: make pkg-test PKG=core
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run test

.PHONY: pkg-typecheck
pkg-typecheck: ## Typecheck a single package
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run typecheck

.PHONY: pkg-lint
pkg-lint: ## Lint a single package
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run lint

.PHONY: pkg-clean
pkg-clean: ## Clean a single package
	@$(call require_pkg)
	$(PNPM) --filter @holeauth/$(PKG) run clean

define require_pkg
	if [ -z "$(PKG)" ]; then \
		echo "Error: PKG is required. Example: make pkg-build PKG=core"; \
		echo "Available: $(PACKAGES)"; \
		exit 1; \
	fi
endef

## Packages — per-name shortcuts (auto-generated targets)

# For each package, generate: dev-<pkg>, build-<pkg>, test-<pkg>, typecheck-<pkg>
define PKG_RULES
.PHONY: dev-$(1) build-$(1) test-$(1) typecheck-$(1) clean-$(1)
dev-$(1): ## Dev: @holeauth/$(1)
	$$(PNPM) --filter @holeauth/$(1) run dev
build-$(1): ## Build: @holeauth/$(1)
	$$(PNPM) --filter @holeauth/$(1) run build
test-$(1): ## Test: @holeauth/$(1)
	$$(PNPM) --filter @holeauth/$(1) run test
typecheck-$(1): ## Typecheck: @holeauth/$(1)
	$$(PNPM) --filter @holeauth/$(1) run typecheck
clean-$(1):
	$$(PNPM) --filter @holeauth/$(1) run clean
endef

$(foreach p,$(PACKAGES),$(eval $(call PKG_RULES,$(p))))

## Release / publishing

.PHONY: changeset
changeset: ## Create a changeset
	$(PNPM) run changeset

.PHONY: version
version: ## Apply changesets and bump versions
	$(PNPM) run version-packages

.PHONY: release
release: ## Build packages and publish via changesets
	$(PNPM) run release

## Combined workflows

.PHONY: ci
ci: install lint typecheck test build ## Run the full CI pipeline locally

.PHONY: fresh
fresh: clean-all install ## Wipe everything and reinstall

.PHONY: up
up: db-up ## Alias for db-up

.PHONY: down
down: db-down ## Alias for db-down
