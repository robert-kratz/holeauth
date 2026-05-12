---
name: integrate-holeauth
description: "Integrate holeauth into a project from scratch. Use when: adding authentication, setting up auth, integrating holeauth, installing holeauth, adding login, adding 2FA, adding passkeys, adding RBAC, adding SSO, becoming an OIDC provider, consuming an OIDC provider, adding sessions. Asks what features are needed and loads the right per-package skills."
argument-hint: "Describe your project (framework, DB, desired auth features)"
---

# Integrate holeauth

Entry-point skill for adding holeauth to any project. Interviews the user about their stack, then loads the appropriate per-package skills. **Always** writes fully-filled config blocks (every supported option present, even when defaulted) so the user has a single place to flip switches later.

## Procedure

### Step 1 — Interview (REQUIRED, batch via `vscode/askQuestions`)

Ask the following in a single batch. Do not skip questions; use the recommended option as fallback only if the user explicitly opts out.

1. **Framework / runtime** — `framework` — single select
   - `Next.js (App Router) — first-class via @holeauth/nextjs` *(recommended)*
   - `Next.js (Pages Router) — manual route wiring`
   - `React (Vite / generic SPA) — uses @holeauth/react against an existing API host`
   - `Vue.js / Nuxt — bring your own bindings, uses @holeauth/core directly`
   - `Node (Express / Fastify / Hono) — manual route wiring against @holeauth/core`
   - `Headless / Edge worker only — pure @holeauth/core`

2. **tRPC** — `trpc` — single select
   - `Yes — auth-aware context with getSessionOrRefresh` (loads `integrate-holeauth-trpc`)
   - `No`

3. **Persistence layer** — `persistence` — single select
   - `Drizzle ORM (PostgreSQL)` *(recommended)*
   - `Drizzle ORM (MySQL)`
   - `Drizzle ORM (SQLite)`
   - `Headless / bring-your-own adapter — implement Adapter interfaces yourself`

4. **User table** — `usersTable` — single select
   - `I already have a users table — show me the columns`
   - `Scaffold a fresh app_users table` *(recommended for greenfield)*

5. **Plugins** — `plugins` — multi-select (`multiSelect: true`, `allowFreeformInput: false`)
   - `Two-Factor Authentication (TOTP + recovery codes)` → loads `integrate-holeauth-2fa`
   - `Passkeys (WebAuthn / FIDO2)` → loads `integrate-holeauth-passkey`
   - `RBAC (groups + permissions, YAML or DB)` → loads `integrate-holeauth-rbac`
   - `IDP server — issue OIDC tokens to other apps` → loads `integrate-holeauth-idp`
   - `IDP consumer — log users in via an external OIDC provider (incl. another holeauth IDP)` → loads `integrate-holeauth-idp-consumer`

6. **Built-in SSO providers** — `ssoProviders` — multi-select (Core feature, separate from `IDP consumer`)
   - `Google` — `GoogleProvider` from `@holeauth/core/sso`
   - `GitHub` — `GithubProvider` from `@holeauth/core/sso`
   - `None`

7. **Registration mode** — `registration` — single select
   - `Self-serve (anyone can register)` *(default)*
   - `Invite-only (admin issues invites; public register flow throws REGISTRATION_DISABLED)`
   - `Self-serve + invites (both)`

8. **First superuser strategy** — `superuser` — single select *(critical — user MUST pick one)*
   - `Seed script — db:seed creates a known admin email/password and assigns the admin RBAC group` *(recommended)*
   - `Bootstrap CLI — pnpm holeauth:promote <email> elevates an existing user`
   - `Env-driven — first registered user whose email matches HOLEAUTH_BOOTSTRAP_ADMIN_EMAIL is auto-promoted on user.registered`
   - `Manual SQL — document a snippet, no automation`
   - `None — handled by an external IDP / SSO claim`

9. **Auth base path** — `basePath` — single select: `/api/auth` *(default)* | `Custom`

10. **Session refresh middleware** — `middleware` — single select
    - `Yes — protectAllExcept allow-list (recommended for Next.js App Router)`
    - `Yes — refresh-only, no route protection`
    - `No`

11. **Environment file** — `envFile` — single select: `.env.local` | `.env` | `Vault / external`

> Do not invent answers. If a deferred question is unanswered, surface a clear default and continue.

### Step 2 — Route to the right per-package skills

Always load the entry skill chain in this exact order, passing the answers from Step 1 forward (do **not** re-ask):

1. **Always:** `.github/skills/integrate-holeauth-core/SKILL.md`
2. For each selected plugin, in order:
   - `Two-Factor` → `.github/skills/integrate-holeauth-2fa/SKILL.md`
   - `Passkeys` → `.github/skills/integrate-holeauth-passkey/SKILL.md`
   - `RBAC` → `.github/skills/integrate-holeauth-rbac/SKILL.md`
   - `IDP server` → `.github/skills/integrate-holeauth-idp/SKILL.md`
   - `IDP consumer` → `.github/skills/integrate-holeauth-idp-consumer/SKILL.md`
3. If `tRPC: Yes` → `.github/skills/integrate-holeauth-trpc/SKILL.md`

Each per-plugin skill MUST emit the **full** config object — every documented option spelled out with its default value, even if the user picked the default. Comment unused branches with `// disabled — flip to enable`. This guarantees the user can toggle features later without re-deriving the API surface.

### Step 3 — Superuser bootstrap

Implement the strategy chosen in Q8 **before** finishing. The skill writes the corresponding artifact:

| Strategy | Artifact |
|---|---|
| Seed script | `scripts/seed.ts` (uses `@holeauth/core/password` `hash()`, inserts user + `userGroups` row with `onConflictDoNothing`). Adds `db:seed` script. |
| Bootstrap CLI | `scripts/promote.ts` accepting `--email`, calling `auth.rbac.assignGroup(userId, 'admin')`. |
| Env-driven | `auth.on('user.registered', …)` listener in `lib/auth.ts` that promotes the matching email exactly once. |
| Manual SQL | A `docs/SUPERUSER.md` snippet only. |
| None | Note in README. |

Mention this requires the RBAC plugin if RBAC was selected; otherwise skip group assignment.

### Step 4 — Summary checklist

After all skills complete, print:
- [ ] Packages installed (list each `@holeauth/*` package and its version pin)
- [ ] Drizzle schema regenerated + migrated (if Drizzle)
- [ ] `lib/auth.ts` exports a fully-typed `auth` with every selected plugin and disabled-but-stubbed config blocks
- [ ] Route handler at `<basePath>/[...holeauth]/route.ts`
- [ ] Middleware behaviour matches Q10
- [ ] Provider wired in `app/layout.tsx` (Next.js) or root component
- [ ] Superuser strategy implemented per Q8
- [ ] `.env.local` keys present (`HOLEAUTH_SECRET`, `DATABASE_URL`, plugin-specific vars)
- [ ] `pnpm dev` boots; `GET <basePath>/session` returns `null` for an anonymous request

## Constraints

- Never invent options. If a flag isn't in the package's TypeScript interface, don't write it.
- Always emit fully-filled config — do not collapse defaults into omissions.
- Match the **current** API: `createAuthHandler` (Next.js) wrapping `defineHoleauth`, plugin factories `twofa`, `passkey`, `rbac`, `idp`, adapter factories `createHoleauthAdapters`, `createRbacAdapter`, `createTwoFactorAdapter`, `createPasskeyAdapter`, `createIdpAdapter`, all taking `{ db, tables }`.
- The `IDP server` and `IDP consumer` are **two separate skills**. The server runs the OIDC endpoints (`/.well-known/...`, `/oauth2/*`); the consumer is an RP that signs users into your app via someone else's OIDC.

## Reference implementations in this monorepo

- Server-side reference: [apps/playground/lib/auth.ts](apps/playground/lib/auth.ts), [apps/playground/db/schema.ts](apps/playground/db/schema.ts), [apps/playground/middleware.ts](apps/playground/middleware.ts), [apps/playground/holeauth.rbac.yml](apps/playground/holeauth.rbac.yml), [apps/playground/scripts/seed.ts](apps/playground/scripts/seed.ts)
- IDP-consumer reference: [apps/client-playground/lib/oidc.ts](apps/client-playground/lib/oidc.ts), [apps/client-playground/lib/session.ts](apps/client-playground/lib/session.ts)
- tRPC reference: [apps/playground/lib/trpc/server.ts](apps/playground/lib/trpc/server.ts), [apps/playground/app/api/trpc/[trpc]/route.ts](apps/playground/app/api/trpc/%5Btrpc%5D/route.ts)
