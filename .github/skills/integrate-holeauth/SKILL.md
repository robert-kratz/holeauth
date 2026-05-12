---
name: integrate-holeauth
description: "Entry-point skill for adding holeauth authentication to an existing project. Use when: adding authentication, setting up auth, integrating holeauth, installing holeauth, adding login, adding 2FA, adding passkeys, adding RBAC, adding SSO, becoming an OIDC provider, consuming an OIDC provider, adding sessions. Asks what features are needed and routes to the right per-package skills."
argument-hint: "Optional: comma-separated plugin list to skip the multi-select (e.g. '2fa,rbac')"
---

# Integrate holeauth

Dispatcher skill. Interviews the user, then loads the appropriate per-package integration skills in dependency order.

## When NOT to use

- Starting a brand-new Next.js project from scratch → use `bootstrap-nextjs-holeauth` instead.
- Building a custom holeauth plugin → use `holeauth-plugin-design`.

## Source of truth

Implementation details live in the docs. Fetch them on demand:

- Docs root: `https://docs.holeauth.dev/docs`
- Search API: `GET https://docs.holeauth.dev/api/search?q=<term>`
- Reference auth setup: `apps/playground/lib/auth.ts` in the holeauth repo.

---

## Procedure

### Step 1 — Interview

Use `vscode_askQuestions` with these questions. **Never assume defaults — always ask.**

| # | Variable | Type | Options |
|---|---|---|---|
| 1 | `framework` | radio | Next.js App Router (recommended) / Next.js Pages Router / Express / Hono / Other (bail) |
| 2 | `persistence` | radio | Drizzle Postgres / Drizzle MySQL / Drizzle SQLite / Headless (BYO adapter) |
| 3 | `usersTable` | radio | Existing application table (ask for path) / Scaffold `app_users` |
| 4 | `plugins` | multi-select | 2FA · Passkeys · RBAC · IDP server · IDP consumer · (none) |
| 5 | `trpc` | radio | Yes / No |
| 6 | `ssoProviders` | multi-select | Google · GitHub · None (these are CORE providers — not the IDP consumer) |
| 7 | `useReactUi` | radio | Yes — use `@holeauth/react-ui` headless components · No — build own UI |
| 7b | `uiStyle` (only if `useReactUi === Yes`) | radio | Tailwind CSS · CSS Modules · Inline styles (unstyled) |
| 8 | `registration` | radio | Self-serve · Invite-only · Both |
| 9 | `superuser` | radio | Seed script · Bootstrap CLI · Env-driven · Manual SQL · None |
| 10 | `basePath` | text | default `/api/auth` |
| 11 | `middleware` | radio | protectAllExcept (recommended) · refresh-only · None |

---

### Step 2 — Route to per-package skills

Run skills in this strict order. Each loaded skill inherits the answers from Step 1.

1. **Always:** `integrate-holeauth-core`
2. If `plugins` includes 2FA: `integrate-holeauth-2fa`
3. If `plugins` includes Passkeys: `integrate-holeauth-passkey`
4. If `plugins` includes RBAC: `integrate-holeauth-rbac`
5. If `plugins` includes IDP server: `integrate-holeauth-idp`
6. If `plugins` includes IDP consumer: `integrate-holeauth-idp-consumer`
7. If `trpc === Yes`: `integrate-holeauth-trpc`

If `framework` is **Express or Hono**: do NOT bail. The `integrate-holeauth-core` skill supports these frameworks. Pass the `framework` variable through and the core skill will reference the correct platform adapter and docs.

---

### Step 3 — Superuser bootstrap

Based on the `superuser` choice, write the corresponding artifact:

- **Seed script** → `scripts/seed.ts` with a `tsx` shebang that creates the first user and assigns the admin group (only valid if RBAC was selected).
- **Bootstrap CLI** → `scripts/bootstrap-admin.ts` that reads CLI args / prompts for email + password.
- **Env-driven** → `scripts/promote-from-env.ts` reading `BOOTSTRAP_ADMIN_EMAIL` on first boot.
- **Manual SQL** → emit a `docs/SUPERUSER.md` with the exact SQL.
- **None** → skip.

---

### Step 4 — Verification checklist

Print this checklist back to the user. They run the commands; you don't.

```
[ ] pnpm install completed without peer-dep warnings
[ ] Drizzle migration generated and applied (pnpm db:push or drizzle-kit push)
[ ] Auth route handler responds at <basePath>/... (e.g. GET /api/auth/.well-known/openid-configuration)
[ ] Middleware is in place and protects authenticated routes
[ ] HoleauthProvider wraps the app in the root layout
[ ] /login page exists and loads (200 — no 404)
[ ] /register page exists and loads (if registration is self-serve or both)
[ ] /(guest)/layout.tsx (or equivalent) redirects authenticated users away from guest routes
[ ] Sign-up flow completes end-to-end
[ ] Sign-in flow completes end-to-end
[ ] If 2FA selected: /2fa/verify page exists; TOTP code accepted after sign-in
[ ] If Passkeys selected: passkey register and login pages exist and work
[ ] If RBAC selected: default group auto-assigned after registration
[ ] Font set in root layout (not browser default serif)
[ ] Superuser created (if applicable)
[ ] Required env vars set: HOLEAUTH_SECRET, DATABASE_URL, APP_URL
[ ] pnpm typecheck passes
[ ] pnpm build succeeds
```

---

## Hard constraints

- **Never invent options.** If unsure, ask. Never write `defineHoleauth` directly in Next.js setups — use `createAuthHandler` from `@holeauth/nextjs-app-router`.
- **Plugin factory names:** `twofa`, `passkey`, `rbac`, `idp`. Adapter factories: `createHoleauthAdapters`, `createRbacAdapter`, `createTwoFactorAdapter`, `createPasskeyAdapter`, `createIdpAdapter` — all take `{ db, tables }`.
- **Plugins array must be `as const`** for full TypeScript inference of `auth.<pluginKey>.<method>()`.
- **`cookiePrefix` must be identical** in `createAuthHandler`, `holeauthMiddleware`, and `HoleauthProvider`.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=<topic>
```

Example queries: `account linking`, `audit log`, `refresh rotation`, `csrf`, `events`.
