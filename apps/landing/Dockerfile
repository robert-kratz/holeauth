# syntax=docker/dockerfile:1
# Build context: monorepo root

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/landing/package.json             apps/landing/package.json
COPY packages/tsconfig/package.json        packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules               ./node_modules
COPY --from=deps /app/apps/landing/node_modules  ./apps/landing/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json tsconfig.base.json ./
COPY apps/landing apps/landing
COPY packages     packages

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
# Docs runs on its own subdomain (docs.holeauth.dev). Pass the absolute URL
# at build time, e.g. --build-arg NEXT_PUBLIC_DOCS_URL=https://docs.holeauth.dev.
# In dev set NEXT_PUBLIC_DOCS_URL=http://localhost:3001 in .env.local.
ARG NEXT_PUBLIC_DOCS_URL=""
ENV NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_DOCS_URL}

RUN pnpm --filter landing build

# ─── Stage 3: runner (Next.js standalone) ────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/landing/.next/standalone          ./
COPY --from=builder /app/apps/landing/.next/static              ./apps/landing/.next/static
COPY --from=builder /app/apps/landing/public                    ./apps/landing/public

EXPOSE 3000
CMD ["node", "apps/landing/server.js"]
