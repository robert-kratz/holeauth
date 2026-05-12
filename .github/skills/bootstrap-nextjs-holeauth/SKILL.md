---
name: bootstrap-nextjs-holeauth
description: "Bootstrap a brand-new Next.js project with TypeScript, Drizzle ORM (or headless), tRPC (optional), and a fully wired holeauth integration covering ALL plugins (2FA, passkey, RBAC, IDP server, IDP consumer). Use when: starting a new Next.js project with auth, scaffolding Next.js + Drizzle + holeauth from scratch, creating a fresh app with login, generating a greenfield holeauth setup, 'create new nextjs holeauth project'. Interviews via vscode/askQuestions, scaffolds the app, then delegates to the per-package skills. Always emits FULLY-FILLED config blocks so disabled features can be flipped on later without re-deriving the API."
argument-hint: "Project folder name and desired auth features (Core, 2FA, passkey, RBAC, IDP server, IDP consumer, tRPC)"
---

# Bootstrap Next.js + Drizzle + holeauth

Creates a **greenfield** Next.js (App Router, TypeScript) project, configures persistence, optionally wires tRPC, and integrates holeauth end-to-end with **every selected plugin**. The generated `lib/auth.ts` always contains a fully-filled `createAuthHandler({...})` block — disabled options are present and commented so the user can flip them later.

> **Pin policy**: Install Next.js at the latest minor of the `16.x` line that the playground tracks (the playground is the source of truth — read its `package.json` and reuse the exact pin). Do not silently bump.

## Procedure

### Step 1 — Interview (REQUIRED, batch via `vscode/askQuestions`)

Always ask **before** creating files or running commands. Use these questions verbatim. Do not invent answers.

1. **Project directory** — `projectDir` — free text — default `my-app`.
2. **Package manager** — `packageManager` — `pnpm` *(recommended)* | `npm` | `yarn` | `bun`.
3. **Framework** — `framework` — single select
   - `Next.js (App Router)` *(default — first-class support)*
   - `Next.js (Pages Router)` — manual route wiring; this skill bails out and points at `integrate-holeauth-core`.
   - For React (Vite), Vue / Nuxt, plain Node: bail out and instruct the user to use `integrate-holeauth` directly — this bootstrap is Next-specific.
4. **Persistence** — `persistence` — single select
   - `Drizzle PostgreSQL` *(recommended)*
   - `Drizzle MySQL`
   - `Drizzle SQLite`
   - `Headless (implement Adapter interfaces by hand)`
5. **Database hosting** — `dbHosting` — `Local Docker (compose)` | `Existing DATABASE_URL` | `Skip`. Hidden if persistence is headless.
6. **tRPC** — `trpc` — `Yes — auth-aware context + permissionProcedure` | `No`.
7. **Plugins** — `plugins` — multi-select (`multiSelect: true`)
   - `Two-Factor Authentication (TOTP + recovery codes)`
   - `Passkeys (WebAuthn / FIDO2)`
   - `RBAC (groups + permissions, YAML + DB)`
   - `IDP server — issue OIDC tokens to other apps`
   - `IDP consumer — log in via an external OIDC provider`
8. **Per-plugin questions** — ask the dedicated questions of each selected plugin's skill **inline** (do not delegate this step yet). Required so all answers are gathered up-front:
   - **2FA**: issuer name, recovery code count (`10` default), pending TTL (`300`), enrollment policy (opt-in / required / required for groups), QR rendering.
   - **Passkey**: `rpName`, `rpID`, `rpOrigin`, role (primary/secondary), pending TTL, discoverable creds.
   - **RBAC**: source (YAML + DB / DB-only / static), initial roles, default role, permission style, cache TTL, watch in dev, where to enforce.
   - **IDP server**: issuer URL, signing alg (`RS256`), client types, PKCE policy, scopes, multi-tenant teams, consent screen, TTLs, perm nodes, token rate limit.
   - **IDP consumer**: upstream issuer URL, client type, client_id/secret, redirect URI, scopes, local session storage (Drizzle/JWT), refresh strategy, logout behaviour.
9. **Built-in SSO providers** — `ssoProviders` — multi-select: `Google`, `GitHub`, `None`.
10. **Registration mode** — `registration` — `Self-serve` *(default)* | `Invite-only` | `Both`.
11. **First superuser strategy** — `superuser` — single select *(critical)*:
    - `Seed script (db:seed creates admin@example.com / Password1!, admin group)` *(default if RBAC selected)*
    - `Bootstrap CLI (pnpm holeauth:promote <email>)`
    - `Env-driven (HOLEAUTH_BOOTSTRAP_ADMIN_EMAIL auto-promotes on user.registered)`
    - `Manual SQL (docs only)`
    - `None`
12. **Auth base path** — `basePath` — `/api/auth` *(default)* | custom.
13. **Middleware** — `middleware` — `protectAllExcept allow-list` *(default)* | `Refresh-only` | `None`.
14. **Initialize git** — `git` — Yes / No.

### Step 2 — Scaffold Next.js

Read the playground's `package.json` to get the exact Next pin, then run:

```bash
pnpm create next-app@<pin> <projectDir> \
  --ts --app --tailwind --eslint --no-src-dir \
  --import-alias "@/*" --use-pnpm --skip-install
cd <projectDir>
# Fix package.json so "next": "<pin>" is exact (no caret).
pnpm install
```

Adjust the package manager invocation per Q2.

### Step 3 — Drizzle (skip if headless)

Install based on dialect (see `integrate-holeauth-core` Step 3) and create:
- `drizzle.config.ts`
- `db/client.ts`
- `db/schema.ts` — start with the `app_users` block; the per-plugin skills will append their `createXxxTables(...)` calls in Step 5.
- `docker-compose.yml` if `dbHosting === 'Local Docker'`.

Add scripts:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

If `superuser === Seed script`, also add `"db:seed": "tsx scripts/seed.ts"`. If `superuser === Bootstrap CLI`, add `"holeauth:promote": "tsx scripts/promote.ts"`.

### Step 4 — Environment file

```bash title=".env.local"
DATABASE_URL="postgres://user:pass@localhost:5432/app"
HOLEAUTH_SECRET="<openssl rand -base64 48>"
APP_URL="http://localhost:3000"
REGISTRATION_SELF_SERVE=true

# Built-in SSO consumers (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Passkey (only if plugin selected)
PASSKEY_RP_ID=localhost
PASSKEY_RP_NAME="My App"

# IDP consumer (only if selected)
HOLEAUTH_ISSUER=
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=http://localhost:3000/api/auth/callback
SCOPES="openid profile email offline_access"

# Superuser bootstrap (only if env-driven strategy)
HOLEAUTH_BOOTSTRAP_ADMIN_EMAIL=
```

Generate the secret value with `openssl rand -base64 48` (mention; ask before executing).

### Step 5 — Delegate to per-package skills

Load and execute these `SKILL.md` files **in order**, passing the answers from Step 1 forward (do not re-ask):

1. **Always:** `.github/skills/integrate-holeauth-core/SKILL.md`
2. For each selected plugin, in this order:
   - 2FA → `.github/skills/integrate-holeauth-2fa/SKILL.md`
   - Passkey → `.github/skills/integrate-holeauth-passkey/SKILL.md`
   - RBAC → `.github/skills/integrate-holeauth-rbac/SKILL.md`
   - IDP server → `.github/skills/integrate-holeauth-idp/SKILL.md`
   - IDP consumer → `.github/skills/integrate-holeauth-idp-consumer/SKILL.md`
3. If `tRPC: Yes` → `.github/skills/integrate-holeauth-trpc/SKILL.md`

#### Critical: emit fully-filled config

When the per-plugin skills build `lib/auth.ts`, the **plugins not selected** still get a commented stub at the bottom of the file so the user can paste-uncomment them later. Example tail of `lib/auth.ts`:

```ts
/* ───────────────────────── Disabled plugins (uncomment to enable) ─────────────────────────
import { twofa } from '@holeauth/plugin-2fa';
import { createTwoFactorAdapter } from '@holeauth/2fa-drizzle/pg';
import { twoFa } from '../db/schema';
//   twofa({
//     adapter: createTwoFactorAdapter({ db, tables: twoFa.tables }),
//     issuer: 'My App',
//     recoveryCodeCount: 10,
//     pendingTtlSeconds: 300,
//   }),
─────────────────────────────────────────────────────────────────────────────────────────── */
```

This guarantees the user has every code block on hand even for features they haven't enabled yet.

### Step 6 — Superuser bootstrap

Implement the strategy chosen in Q11:

- **Seed script** — write `scripts/seed.ts` mirroring [apps/playground/scripts/seed.ts](apps/playground/scripts/seed.ts): hashes a default password, inserts user + `userGroups` row with `onConflictDoNothing()`. Print credentials at the end.
- **Bootstrap CLI** — write `scripts/promote.ts` accepting `--email <addr>`, looking up the user, calling `auth.rbac.assignGroup(userId, 'admin')`. Add to `package.json` scripts.
- **Env-driven** — append to `lib/auth.ts`:
  ```ts
  subscribe(auth.config, 'user.registered', async (e) => {
    const target = process.env.HOLEAUTH_BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    if (!target || !e.userId) return;
    const u = await auth.config.adapters.user.getUserById(e.userId);
    if (u?.email?.toLowerCase() === target) {
      await auth.rbac.assignGroup(e.userId, 'admin').catch(() => {});
    }
  });
  ```
- **Manual SQL** — write `docs/SUPERUSER.md` with a copy-paste snippet for the chosen dialect.
- **None** — skip; mention in README.

If RBAC is **not** selected, the seed/promote/env paths drop the group assignment and only create the user.

### Step 7 — Final wiring & verification

- Generate the first migration: `pnpm db:generate && pnpm db:push`.
- If `dbHosting === 'Local Docker'`: remind the user to `docker compose up -d` first.
- Run the seed script (if chosen).
- Print the verification checklist:
  - [ ] `pnpm dev` boots without errors.
  - [ ] `GET /api/auth/session` returns `null` for anonymous.
  - [ ] `POST /api/auth/register` creates a user row.
  - [ ] `POST /api/auth/signin/password` returns tokens.
  - [ ] Each enabled plugin's endpoints respond (`/api/auth/2fa/*`, `/api/auth/passkey/*`, `/api/auth/.well-known/openid-configuration`, `/api/auth/oauth2/*`).
  - [ ] tRPC `me.useQuery()` returns `{ userId }` for the seeded admin and `UNAUTHORIZED` when signed out.
  - [ ] Superuser strategy works (admin can hit `/admin` after seeding/promoting).

### Step 8 — Optional git init

If `git === Yes`, run `git init && git add . && git commit -m "chore: bootstrap nextjs + drizzle + holeauth"`.

## Constraints

- Never silently upgrade `next` past the playground pin.
- Never skip Step 1 — questions must come first.
- Never call destructive commands (`rm -rf`, `git push`, `docker compose down -v`) without explicit user confirmation.
- Use the chosen package manager consistently for installs and scripts.
- Keep all file paths relative to `<projectDir>`; do not modify files outside it.
- Always emit fully-filled config — disabled features are present as commented stubs.
- The Holeauth Next.js helper is `createAuthHandler` — never write `defineHoleauth` directly in Next.js setups.
- Plugin factory names: `twofa`, `passkey`, `rbac`, `idp`. Adapter factories: `createHoleauthAdapters`, `createTwoFactorAdapter`, `createPasskeyAdapter`, `createRbacAdapter`, `createIdpAdapter` — all take `{ db, tables }`.

## Key references in this monorepo

- Server-side reference: [apps/playground/lib/auth.ts](apps/playground/lib/auth.ts), [apps/playground/db/schema.ts](apps/playground/db/schema.ts), [apps/playground/middleware.ts](apps/playground/middleware.ts), [apps/playground/holeauth.rbac.yml](apps/playground/holeauth.rbac.yml)
- Seed script: [apps/playground/scripts/seed.ts](apps/playground/scripts/seed.ts)
- IDP-consumer reference: [apps/client-playground/lib/oidc.ts](apps/client-playground/lib/oidc.ts), [apps/client-playground/lib/session.ts](apps/client-playground/lib/session.ts)
- tRPC reference: [apps/playground/lib/trpc/server.ts](apps/playground/lib/trpc/server.ts), [apps/playground/app/api/trpc/[trpc]/route.ts](apps/playground/app/api/trpc/%5Btrpc%5D/route.ts)
- IDP simulator: [apps/playground/scripts/idp-simulate-client.ts](apps/playground/scripts/idp-simulate-client.ts)
