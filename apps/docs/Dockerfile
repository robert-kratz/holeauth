# syntax=docker/dockerfile:1
# Build context: monorepo root

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/docs/package.json                apps/docs/package.json
COPY packages/tsconfig/package.json        packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules            ./node_modules
COPY --from=deps /app/apps/docs/node_modules  ./apps/docs/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json tsconfig.base.json ./
COPY apps/docs   apps/docs
COPY packages    packages

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
# Pass --build-arg NEXT_PUBLIC_LANDING_URL=https://yourdomain.com so the docs
# sidebar "Landing page" link correctly navigates to the marketing site.
ARG NEXT_PUBLIC_LANDING_URL=""
ENV NEXT_PUBLIC_LANDING_URL=${NEXT_PUBLIC_LANDING_URL}

RUN pnpm --filter docs build

# ─── Stage 3: runner (Next.js standalone) ────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/docs/.next/standalone          ./
COPY --from=builder /app/apps/docs/.next/static              ./apps/docs/.next/static
COPY --from=builder /app/apps/docs/public                    ./apps/docs/public

EXPOSE 3001
CMD ["node", "apps/docs/server.js"]
