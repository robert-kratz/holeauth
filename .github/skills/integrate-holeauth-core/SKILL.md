---
name: integrate-holeauth-core
description: "Set up the holeauth core packages (@holeauth/core, @holeauth/adapter-drizzle, and the matching platform adapter) in any supported framework. Use when: installing holeauth core, setting up the auth instance, creating Drizzle schema for auth, wiring the route handler, adding the HoleauthProvider, configuring middleware. Required first step before any plugin skill. Supports: Next.js App Router, Next.js Pages Router, Express, Hono."
argument-hint: "Inherits answers from integrate-holeauth or bootstrap-nextjs-holeauth"
domain: "authentication, authorization, holeauth, core, adapter-drizzle, nextjs, express, hono"
---

# Integrate holeauth — Core

Wires up the foundation: schema, adapters, auth instance, route handler, middleware, provider.

## Prerequisites

This skill should be invoked by `integrate-holeauth` or `bootstrap-nextjs-holeauth`. If a user invokes it directly, ask the dispatcher questions first (framework, persistence, usersTable).

## Source of truth

- Reference config: `apps/playground/lib/auth.ts`
- Reference schema: `apps/playground/db/schema.ts`
- Reference middleware: `apps/playground/middleware.ts`
- Docs: `https://docs.holeauth.dev/docs/packages/core`, `https://docs.holeauth.dev/docs/packages/adapter-drizzle`, `https://docs.holeauth.dev/docs/packages/nextjs-app-router`, `https://docs.holeauth.dev/docs/packages/react`

---

## Procedure

### Step 1 — Clarify missing answers

Inherit from dispatcher. Ask only what's missing:

| Variable | Type | Default if not asked |
|---|---|---|
| `framework` | radio | Next.js App Router · Next.js Pages Router · Express · Hono |
| `dialect` | radio | pg / mysql / sqlite |
| `usersTablePath` | text | `db/schema.ts` exports `users` |
| `cookiePrefix` | text | `holeauth` |
| `accessTtl` | number (seconds) | 900 (15min) |
| `refreshTtl` | number (seconds) | 2592000 (30d) |
| `allowDangerousEmailAccountLinking` | radio | `false` (security default) |
| `ssoProviders` | multi-select | Google / GitHub / None |
| `logger` | radio | console / none / custom |
| `useReactUi` | radio | Yes — use `@holeauth/react-ui` headless components · No — build own UI |
| `uiStyle` (only if `useReactUi === Yes`) | radio | Tailwind CSS · CSS Modules · Inline styles (unstyled) |

---

### Step 2 — Install

```bash
# Core + Drizzle adapter (always)
pnpm add @holeauth/core @holeauth/adapter-drizzle drizzle-orm

# Dialect driver:
pnpm add pg                 # Postgres
pnpm add mysql2             # MySQL
pnpm add better-sqlite3     # SQLite
pnpm add -D drizzle-kit @types/pg

# Platform adapter (pick exactly one based on `framework`):
pnpm add @holeauth/nextjs-app-router @holeauth/react   # Next.js App Router / Pages Router
pnpm add @holeauth/express                              # Express
pnpm add @holeauth/hono                                 # Hono
```

For password hashing on Node runtime (optional, faster than scrypt fallback):

```bash
pnpm add @node-rs/argon2
```

---

### Step 3 — Drizzle schema

Create `db/schema.ts`:

```ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createHoleauthTables } from '@holeauth/adapter-drizzle/<dialect>';

// Application-owned users table. holeauth NEVER defines this — you do.
export const users = pgTable('app_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const core = createHoleauthTables({ usersTable: users });

// Re-export for drizzle-kit
export const sessions = core.tables.sessions;
export const accounts = core.tables.accounts;
export const verificationTokens = core.tables.verificationTokens;
export const auditLog = core.tables.auditLog;

export const schema = { ...core.tables, ...core.relations };
```

**Critical:** `core.tables` does **not** include `users` — that's the app-owned table. Do NOT add `users` to the `schema` spread again or you'll get a duplicate-table error.

> **⚠️ drizzle-kit gotcha:** `createHoleauthTables()` returns a plain object. drizzle-kit detects tables by scanning top-level **named exports** from the schema file — it will not recurse into nested objects. Always destructure and re-export each table individually (as shown above). Omitting the re-exports causes `relation "holeauth_audit_log" does not exist` (and similar) runtime errors because those tables are never included in the migration.

If the user picked "existing application table", swap the `users` declaration for their existing import.

---

### Step 4 — DB client

Create `db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/<dialect>';
// pg example:
import { Pool } from 'pg';
import { schema } from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

---

### Step 5 — Auth instance (fully-filled)

> **Platform note:** The config object is identical across all frameworks. The only difference is the import:
> - **Next.js App Router / Pages Router:** `import { createAuthHandler } from '@holeauth/nextjs-app-router'`
> - **Express:** `import { createAuthHandler } from '@holeauth/express'`
> - **Hono:** `import { createAuthHandler } from '@holeauth/hono'`
> For non-Next.js setups, replace the import and refer to the platform docs at `https://docs.holeauth.dev/docs/packages/<framework>`.

Create `lib/auth.ts`:

```ts
import { createAuthHandler } from '@holeauth/nextjs-app-router'; // swap for your platform adapter
import { createHoleauthAdapters } from '@holeauth/adapter-drizzle/<dialect>';
import { GoogleProvider, GithubProvider } from '@holeauth/core/sso';
import { db } from '../db/client';
import { core } from '../db/schema';

const holeauth = createHoleauthAdapters({ db, tables: core.tables });

const providers = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/auth/callback/google`,
  }));
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(GithubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/auth/callback/github`,
  }));
}

export const auth = createAuthHandler({
  secrets: { jwtSecret: process.env.HOLEAUTH_SECRET! },
  adapters: {
    user: holeauth.user,
    session: holeauth.session,
    account: holeauth.account,
    auditLog: holeauth.auditLog,
    verificationToken: holeauth.verificationToken,
    transaction: holeauth.transaction,
  },
  providers,
  plugins: [] as const, // <- plugin skills append to this array
  tokens: { cookiePrefix: '<cookiePrefix>' },
  allowDangerousEmailAccountLinking: false,
  registration: {
    selfServe: process.env.REGISTRATION_SELF_SERVE !== 'false',
    inviteTtlSeconds: 7 * 24 * 60 * 60,
    inviteUrl: ({ token }) =>
      `${process.env.APP_URL}/register/accept?token=${encodeURIComponent(token)}`,
  },
  onEvent: (e) => {
    console.log('[holeauth:event]', e.type, { userId: e.userId, sid: e.sessionId });
  },
});
```

**Always emit the full block.** When plugins are disabled, leave them as commented stubs so the user can flip them on later without re-running this skill.

---

### Step 6 — Route handler

Mount a catch-all route that forwards all requests under `<basePath>` to `auth.handlers.GET` / `auth.handlers.POST`. **This step is platform-specific** — the AI agent must implement it in the pattern appropriate for `framework`.

Docs:
- Next.js App Router: `https://docs.holeauth.dev/docs/packages/nextjs-app-router#route-handler`
- Express: `https://docs.holeauth.dev/docs/packages/express#route-handler`
- Hono: `https://docs.holeauth.dev/docs/packages/hono#route-handler`

Reference (Next.js App Router only — `app/api/auth/[...holeauth]/route.ts`):

```ts
import { auth } from '@/lib/auth';
export const runtime = 'nodejs'; // argon2 + scrypt-fallback need Node
export function GET(req: Request): Promise<Response> { return auth.handlers.GET(req); }
export function POST(req: Request): Promise<Response> { return auth.handlers.POST(req); }
```

---

### Step 7 — Constants

Create `lib/constants.ts`:

```ts
export const AFTER_AUTH_PATH = '/'; // or the value chosen in the interview
export const AUTH_BASE_PATH = '/api/auth';
export const COOKIE_PREFIX = '<cookiePrefix>';
```

---

### Step 8 — Middleware

Configure request-level middleware to validate JWTs, protect routes, and handle token refresh. Use the `protectAllExcept` strategy (recommended): all routes require authentication except the explicitly listed public paths.

**This step is platform-specific** — the AI agent must implement it in the pattern appropriate for `framework`:
- **Next.js App Router 16+:** file is `proxy.ts` next to `app/` — i.e. `src/proxy.ts` for the `src/` layout, otherwise project root. **Next.js will silently ignore the file if `app/` lives under `src/` but `proxy.ts` is at the project root.**
- **Next.js App Router 15 and earlier:** file is `middleware.ts` with the same placement rule
- **Express / Hono:** middleware registered on the router

Docs:
- Next.js: `https://docs.holeauth.dev/docs/packages/nextjs-app-router#middleware`
- Express: `https://docs.holeauth.dev/docs/packages/express#middleware`
- Hono: `https://docs.holeauth.dev/docs/packages/hono#middleware`

The following paths **must always be accessible without authentication** (include them in `protectAllExcept` or equivalent):

```
/login, /register, /register/accept, /logout,
/password/forgot, /password/reset,
/passkey/login, /sso, /2fa/verify,
/api/auth, /_next, /favicon.ico
```

Key config values the middleware must receive:
- `secrets.jwtSecret` = `process.env.HOLEAUTH_SECRET!`
- `tokens.cookiePrefix` = `'<cookiePrefix>'` — must match exactly
- `adapters: {} as any` — middleware ONLY validates JWTs, never touches the DB
- `signInPath: '/login'`

---

### Step 9 — Provider

Wrap the app root with `HoleauthProvider` from `@holeauth/react`. Pass in:
- `basePath` — must match `AUTH_BASE_PATH` (`'/api/auth'` by default)
- `cookiePrefix` — must match the value in `createAuthHandler` and the middleware

**The AI agent adds the provider to the framework-appropriate root layout or entry point.** For Next.js App Router this is `app/layout.tsx`; for other frameworks, the equivalent root component.

Docs: `https://docs.holeauth.dev/docs/packages/react#provider`

---

### Step 9b — UI components (only if `useReactUi === Yes`)

Install:

```bash
pnpm add @holeauth/react-ui
```

`@holeauth/react-ui` exports **fully headless compound components** — zero CSS, all styling via `className` / `style` props. Never import a stylesheet from this package.

| Component | Purpose |
|---|---|
| `SignInForm` | Email + password + 2FA pending state + optional passkey button |
| `SignUpForm` | Email + password + name |
| `SignOutButton` | Triggers sign-out |
| `SsoButton` | One per SSO provider |
| `PasskeyLoginButton` | Standalone passkey sign-in trigger |
| `PasskeySetup` | Passkey enrollment flow |
| `TwoFactorVerifyForm` | TOTP code entry |
| `PasswordResetRequestForm`, `PasswordChangeForm` | Password recovery |

Docs + usage examples: `https://docs.holeauth.dev/docs/packages/react-ui`

**The AI agent generates the login, register, and other auth pages using these components**, styled for `<uiStyle>`. It must not use platform-specific router imports from this skill — that is determined at generation time.

---

### Step 10 — Guest UI pages

After provider and middleware are in place, the following routes must exist and be reachable **without authentication**:

| Route | Purpose |
|---|---|
| `/login` | Sign-in form |
| `/register` | Self-serve sign-up (if `registration.selfServe` is `true`) |
| `/register/accept` | Invite token acceptance (if invite-only or both) |

Also create a guest route group layout (e.g. `app/(guest)/layout.tsx` for Next.js App Router) that redirects already-authenticated users to `AFTER_AUTH_PATH`, preventing signed-in users from hitting the login/register pages.

**The AI agent generates these files in a platform-appropriate way** based on `framework`. Do not hard-code their implementation in this skill. Refer to:
- Platform docs: `https://docs.holeauth.dev/docs/getting-started/<framework>/login`
- Reference implementation: `apps/playground/app/(guest)/` in the holeauth repo

---

### Step 11 — Env

Add to `.env.local`:

```
HOLEAUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgres://...
APP_URL=http://localhost:3000
# Optional SSO:
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

---

## Hardcoded gotchas

These cannot be derived from the docs alone — **embed them in the generated code as comments where relevant**:

1. **`plugins: [...] as const`** — without `as const`, TypeScript cannot infer `auth.<pluginKey>.<method>()` and downstream skills break.
2. **`adapters: {} as any`** in `holeauthMiddleware` is intentional — the middleware only validates JWTs, never touches the DB. Do NOT pass real adapters there.
3. **File is `proxy.ts` on Next.js 16+**, `middleware.ts` on Next.js 15 and earlier. **It must sit next to `app/`** — `src/proxy.ts` for the `src/` layout, otherwise project root. Wrong location = no middleware runs = no session refresh.
4. **Event name is `'user.registered'`** — NOT `'user.created'`. The other reliable events: `user.login`, `user.logout`, `user.invite_consumed`, `session.created`, `token.rotated`.
5. **`cookiePrefix` must match exactly** in three places: `createAuthHandler({ tokens })`, `holeauthMiddleware({ config: { tokens }})`, `<HoleauthProvider cookiePrefix>`.
6. **`core.tables` does NOT contain `users`** — that's app-owned. Adding it again to the schema spread produces a Drizzle duplicate-table error.
7. **`runtime = 'nodejs'`** on the route handler — `@node-rs/argon2` and scrypt-fallback need Node APIs.
8. **`@holeauth/react-ui` ships zero CSS.** It is fully headless — never import a stylesheet from it. All styling is done by passing `className` / `style` props to each compound-component slot. Forgetting this leads to completely unstyled forms with no error in the console.
9. **`getFullSession` does NOT load the user row by default.** `result.user` is `undefined` unless `{ loadUser: true }` is passed as the second argument. Always pass it when rendering user data (e.g. email, name) in a Server Component:
   ```ts
   const result = await getFullSession(auth, { loadUser: true });
   // result.user.email is now defined
   ```

---

---

## Verification checklist

After completing all steps, confirm the following before reporting success:

```
[ ] pnpm install completed without peer-dep warnings
[ ] DB schema pushed: pnpm db:push (or drizzle-kit push)
[ ] Auth route handler responds at <basePath>/.well-known/... (or equivalent)
[ ] Middleware is in place and protects authenticated routes
[ ] HoleauthProvider wraps the app root
[ ] /login, /register pages exist and load without a 404
[ ] Visiting a protected route while unauthenticated redirects to /login
[ ] Required env vars set: HOLEAUTH_SECRET, DATABASE_URL, APP_URL
[ ] pnpm typecheck passes with 0 errors
[ ] pnpm build succeeds
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=<topic>
```

Useful topics: `account-linking`, `token-rotation`, `csrf`, `events`, `audit-log`, `email-verification`, `password-reset`.
