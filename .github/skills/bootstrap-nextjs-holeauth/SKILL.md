---
name: bootstrap-nextjs-holeauth
description: "Bootstrap a brand-new Next.js project with TypeScript, Drizzle ORM (or headless), tRPC (optional), and a fully wired holeauth integration covering ALL plugins (2FA, passkey, RBAC, IDP server, IDP consumer). Use when: starting a new Next.js project with auth, scaffolding Next.js + Drizzle + holeauth from scratch, creating a fresh app with login, generating a greenfield holeauth setup, 'create new nextjs holeauth project'. Interviews via vscode_askQuestions, scaffolds the app, then delegates to the per-package skills."
argument-hint: "Optional: target directory name (default: my-app)"
---

# Bootstrap Next.js + holeauth

Greenfield orchestrator. Creates a fresh Next.js App Router project and delegates to the integration skills to wire holeauth + chosen plugins end-to-end.

## When NOT to use

- Existing project → use `integrate-holeauth`.
- Building a custom plugin → use `holeauth-plugin-design`.

## Source of truth

- Reference: `apps/playground/` in the holeauth repo — the playground IS the kitchen-sink example
- Docs: `https://docs.holeauth.dev/docs/getting-started/nextjs-app-router`

---

## Procedure

### Step 1 — Interview (15 questions)

Use `vscode_askQuestions`. **Never skip any question.** Group them logically; don't ask all 15 in one batch.

| # | Variable | Type | Notes |
|---|---|---|---|
| 1 | `projectDir` | text | default `my-app` |
| 2 | `packageManager` | radio | pnpm (recommended) · npm · yarn · bun |
| 3 | `framework` | radio | Next.js App Router (recommended) · Next.js Pages Router · Other (bail) |
| 4 | `persistence` | radio | Drizzle Postgres · Drizzle MySQL · Drizzle SQLite · Headless |
| 5 | `dbHosting` | radio | Local Docker (compose file) · Existing DATABASE_URL · Skip |
| 6 | `trpc` | radio | Yes · No |
| 7 | `plugins` | multi-select | 2FA · Passkeys · RBAC · IDP server · IDP consumer · (none) |
| 8 | (per-plugin) | inline | Ask each selected plugin's interview inline |
| 9 | `ssoProviders` | multi-select | Google · GitHub · None |
| 9b | `useReactUi` | radio | Yes — use `@holeauth/react-ui` headless components · No — build own UI |
| 9c | `uiStyle` (only if `useReactUi === Yes`) | radio | Tailwind CSS · CSS Modules · Inline styles (unstyled) |
| 9d | `pagePattern` | radio | **Server shell** — `page.tsx` is a Server Component (session check + redirect), co-located `<RouteName>Page.tsx` is the Client Component (recommended) · **Client only** — `page.tsx` is a single `'use client'` file |
| 10 | `registration` | radio | Self-serve · Invite-only · Both |
| 11 | `superuser` | radio | Seed script · Bootstrap CLI · Env-driven · Manual SQL · None |
| 12 | `afterAuthPath` | text | default `/` |
| 13 | `basePath` | text | default `/api/auth` |
| 14 | `middleware` | radio | protectAllExcept (recommended) · refresh-only · None |
| 15 | `git` | radio | `git init` Yes · No |

---

### Step 2 — Scaffold Next.js

Read the holeauth playground's `package.json` to find the exact Next.js version pin (**never silently bump Next.js**):

```bash
cat apps/playground/package.json | grep '"next"'
# e.g. "next": "^16.2.4"
```

Then:

```bash
pnpm create next-app@<pinned-version> <projectDir> \
  --typescript --app --src-dir false --tailwind --import-alias "@/*" --no-eslint --no-turbopack
cd <projectDir>
```

Adjust flags for the chosen `packageManager`.

---

### Step 3 — Drizzle setup (if Drizzle was chosen)

Create:

- `drizzle.config.ts` (driver matching dialect)
- `db/client.ts`
- `db/schema.ts` (with the app-owned `users` table — `app_users`)
- `docker-compose.yml` (if `dbHosting === 'Local Docker'`)

> **⚠️ drizzle-kit re-export requirement:** When creating `db/schema.ts`, always destructure and re-export each holeauth table as an individual named export. drizzle-kit scans top-level named exports — it will not detect tables nested inside `holeauth.tables`. Omitting these re-exports means tables like `holeauth_audit_log` are never created in the database, causing `relation does not exist` runtime errors.
>
> ```ts
> export const holeauth = createHoleauthTables({ usersTable: users });
> export const { sessions, accounts, verificationTokens, auditLog } = holeauth.tables;
> ```
>
> Apply the same pattern for every plugin table factory (`createTwoFactorTables`, `createPasskeyTables`, `createRbacTables`, etc.).

Add scripts to `package.json`:

```json
{
  "scripts": {
    "db:up": "docker compose up -d postgres",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

### Step 4 — Constants + env

Create `lib/constants.ts`:

```ts
export const AFTER_AUTH_PATH = '<afterAuthPath>';
export const AUTH_BASE_PATH = '<basePath>';
export const COOKIE_PREFIX = 'holeauth';
```

Create `.env.local`:

```
HOLEAUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgres://postgres:postgres@localhost:5432/myapp
APP_URL=http://localhost:3000
```

---

### Step 5 — Delegate to per-package skills

Run in strict order, passing all interview answers as inherited context:

1. `integrate-holeauth-core` (always) — **must complete Steps 1–11 including guest UI pages**
2. If `2FA` selected: `integrate-holeauth-2fa`
3. If `Passkeys` selected: `integrate-holeauth-passkey`
4. If `RBAC` selected: `integrate-holeauth-rbac`
5. If `IDP server` selected: `integrate-holeauth-idp`
6. If `IDP consumer` selected: `integrate-holeauth-idp-consumer`
7. If `trpc === Yes`: `integrate-holeauth-trpc`

**Always emit fully-filled config blocks.** For plugins the user did NOT select, leave commented stubs in `lib/auth.ts` so they can be flipped on later without re-deriving the API surface.

Example stub:

```ts
// import { twofa } from '@holeauth/plugin-2fa';
// import { createTwoFactorAdapter } from '@holeauth/2fa-drizzle/pg';
// const twoFactorAdapter = createTwoFactorAdapter({ db, tables: twoFa.tables });
// // Then add to plugins: twofa({ adapter: twoFactorAdapter, issuer: '...' })
```

---

### Step 5b — Font setup

After the core skill completes, add a web font to `app/layout.tsx`. Use `next/font/google` with Inter (the standard system-like sans-serif for Next.js apps):

```ts
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
```

Apply `inter.className` (or `inter.variable` if using CSS variables) to the `<html>` or `<body>` element. This ensures the app has a clean, readable default font without requiring an external CDN request at runtime.

---

### Step 5c — Confirm all MVP pages exist

After all per-package skills complete, verify these routes are implemented (the core skill Step 10 creates them, but confirm they were not skipped):

| Route | Required when | Purpose |
|---|---|---|
| `/login` | Always | Email + password sign-in |
| `/register` | `registration === 'self-serve'` or `'both'` | Sign-up form |
| `/register/accept` | `registration === 'invite-only'` or `'both'` | Invite token acceptance |
| `/2fa/verify` | `2FA` plugin selected | TOTP code entry |
| `/(guest)/layout.tsx` | Always | Redirect already-authed users away from guest routes |
| `/settings/2fa` or `/2fa/setup` | `2FA` plugin selected | 2FA enrollment UI |
| `/settings/passkeys` | `Passkeys` plugin selected | Passkey management UI |

If any of these are missing, **create them before proceeding to Step 6.** Reference: `apps/playground/app/(guest)/` and `apps/playground/app/` in the holeauth repo.

---

### Step 5d — Apply page component pattern

Use `pagePattern` to decide how each MVP page is scaffolded:

#### `server-shell` (recommended)

`page.tsx` is a **Server Component** — it checks the session server-side and redirects, then renders a co-located Client Component that owns all interactivity.

```
app/(guest)/login/
  page.tsx          ← Server Component: getSession() → redirect if authed → <LoginPage />
  LoginPage.tsx     ← 'use client': form state, submit handler, error display
```

Pattern for `page.tsx`:

```ts
// app/(guest)/login/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LoginPage } from './LoginPage';

export default async function Page() {
  const session = await auth.getSession();
  if (session) redirect('<afterAuthPath>');
  return <LoginPage />;
}
```

Pattern for `LoginPage.tsx`:

```ts
// app/(guest)/login/LoginPage.tsx
'use client';
// form state, submit handler, error display — no session checks here
```

Apply the same split to every guest route (`/register`, `/register/accept`, etc.) and every protected route (`/dashboard`, `/settings/2fa`, `/settings/passkeys`, etc.). Protected route `page.tsx` redirects to `/login` when there is **no** session.

#### `client-only`

`page.tsx` is a single `'use client'` file. Session checks happen inside the component via the holeauth React hooks or a tRPC query. No co-located file needed, but session validation runs on the client instead of the server.

> **Note:** when `useReactUi === Yes`, the `@holeauth/react-ui` components are rendered inside the Client Component layer regardless of which `pagePattern` is chosen.

---

### Step 6 — Superuser bootstrap

Based on `superuser`:

- **Seed script** → `scripts/seed.ts` (tsx) creates first user + assigns admin group (RBAC required)
- **Bootstrap CLI** → `scripts/bootstrap-admin.ts` with interactive prompts
- **Env-driven** → `scripts/promote-from-env.ts` reads `BOOTSTRAP_ADMIN_EMAIL`
- **Manual SQL** → `docs/SUPERUSER.md` with the exact SQL
- **None** → skip

---

### Step 7 — Build validation

Run:

```bash
pnpm install
pnpm typecheck       # tsc --noEmit
pnpm build           # next build
```

**Fix every error before reporting success.** Most common issues:

- Missing `as const` on the `plugins` array → TS cannot infer `auth.<key>.<method>()`
- `core.tables` spread duplicated `users` → Drizzle duplicate-table error
- `cookiePrefix` mismatch between auth instance and middleware → silent session loss
- Missing guest UI pages → visiting `/login` or `/register` returns 404
- Missing font import in layout.tsx → app uses browser default serif font

---

### Step 8 — Migration + verification

```bash
pnpm db:up           # if docker
pnpm db:push         # apply schema
# Or generate-and-apply if user prefers migration files:
pnpm db:generate
```

Confirm the following MVP checklist before reporting the project as complete:

```
[ ] pnpm install completed without peer-dep warnings
[ ] pnpm typecheck passes with 0 errors
[ ] pnpm build succeeds
[ ] DB schema pushed successfully
[ ] .env.local exists with HOLEAUTH_SECRET, DATABASE_URL, APP_URL populated
[ ] /login page loads (200, no 404)
[ ] /register page loads (200) or correct registration mode
[ ] /(guest)/layout.tsx redirects authenticated users away
[ ] Sign-up flow completes end-to-end
[ ] Sign-in flow completes end-to-end
[ ] If 2FA selected: /2fa/verify page exists; TOTP code accepted
[ ] If Passkeys selected: passkey registration and login work
[ ] If RBAC selected: default group assigned on registration
[ ] Font is set in layout.tsx (not browser default serif)
[ ] Middleware protects authenticated routes (unauthenticated redirect to /login)
[ ] Superuser created (if applicable)
```

---

### Step 9 — Optional git

If `git === Yes`:

```bash
git init
git add -A
git commit -m "feat: bootstrap with holeauth"
```

---

## Hardcoded gotchas

1. **Never silently bump Next.js.** Always read the version pin from `apps/playground/package.json` and use it exactly.
2. **Never write `defineHoleauth` directly** in a Next.js project — always use `createAuthHandler` from `@holeauth/nextjs-app-router`.
3. **Plugin factory names:** `twofa`, `passkey`, `rbac`, `idp` (NOT `twoFactor`, `webauthn`, `rbacPlugin`).
4. **Adapter factories all take `{ db, tables }`:** `createHoleauthAdapters`, `createRbacAdapter`, `createTwoFactorAdapter`, `createPasskeyAdapter`, `createIdpAdapter`.
5. **Skip Step 1 = brittle project.** Always interview. Defaults are NOT safe.
6. **Disabled plugins → commented stubs**, not omission. The user must be able to enable them later by uncommenting.
7. **On Next.js 16+: the middleware file is `proxy.ts`.** Place it **at the same level as `app/`** — so `src/proxy.ts` for the `src/` layout, otherwise the project root. Next.js will silently ignore it if it sits at the project root while `app/` lives under `src/`. On Next.js 15 and earlier the file is `middleware.ts` with the same placement rule.
8. **Always pass the second `DispatchOptions` argument to `createAuthHandler`.** Without it, the SSO callback (GitHub, Google, etc.) falls back to a hardcoded `'/dashboard'` redirect inside the package — regardless of what `AFTER_AUTH_PATH` is set to. Always pass both `basePath` and `defaultRedirect`:

   ```ts
   export const auth = createAuthHandler(
     { /* HoleauthConfig */ },
     {
       basePath: AUTH_BASE_PATH,       // e.g. '/api/auth'
       defaultRedirect: AFTER_AUTH_PATH, // e.g. '/'
     },
   );
   ```

9. **Prefer the server-shell page pattern (`pagePattern === 'server-shell'`).** `page.tsx` must be a Server Component; session checks and redirects belong there. All client-side interactivity (forms, state, event handlers) lives in a co-located `<RouteName>Page.tsx` marked `'use client'`. Never put `'use client'` on `page.tsx` itself when using the server-shell pattern — Next.js will silently lose the server-side session check and the redirect will never fire.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=<topic>
```

Useful topics: `bootstrap`, `playground`, `seed`, `superuser`, `drizzle-kit`.
