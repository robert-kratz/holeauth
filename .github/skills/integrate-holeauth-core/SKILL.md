---
name: integrate-holeauth-core
description: "Set up the holeauth core packages (@holeauth/core, @holeauth/adapter-drizzle, @holeauth/nextjs-app-router, @holeauth/react) in a Next.js App Router project. Use when: installing holeauth core, setting up the auth instance, creating Drizzle schema for auth, wiring the catch-all route handler, adding the HoleauthProvider, configuring middleware. Required first step before any plugin skill."
argument-hint: "Inherits answers from integrate-holeauth or bootstrap-nextjs-holeauth"
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
| `dialect` | radio | pg / mysql / sqlite |
| `usersTablePath` | text | `db/schema.ts` exports `users` |
| `cookiePrefix` | text | `holeauth` |
| `accessTtl` | number (seconds) | 900 (15min) |
| `refreshTtl` | number (seconds) | 2592000 (30d) |
| `allowDangerousEmailAccountLinking` | radio | `false` (security default) |
| `ssoProviders` | multi-select | Google / GitHub / None |
| `logger` | radio | console / none / custom |

---

### Step 2 — Install

```bash
pnpm add @holeauth/core @holeauth/adapter-drizzle @holeauth/nextjs-app-router @holeauth/react drizzle-orm
# dialect driver:
pnpm add pg                 # if pg
pnpm add mysql2             # if mysql
pnpm add better-sqlite3     # if sqlite
pnpm add -D drizzle-kit @types/pg
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

Create `lib/auth.ts`:

```ts
import { createAuthHandler } from '@holeauth/nextjs-app-router';
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

Create `app/api/auth/[...holeauth]/route.ts`:

```ts
import { auth } from '@/lib/auth';

export const runtime = 'nodejs'; // argon2 + scrypt-fallback need Node

export function GET(req: Request): Promise<Response> {
  return auth.handlers.GET(req);
}

export function POST(req: Request): Promise<Response> {
  return auth.handlers.POST(req);
}
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

**Next.js 16+:** the file is `proxy.ts` at the project root.
**Next.js 15 and earlier:** the file is `middleware.ts`.

```ts
import { holeauthMiddleware } from '@holeauth/nextjs-app-router/middleware';

export default holeauthMiddleware({
  config: {
    secrets: { jwtSecret: process.env.HOLEAUTH_SECRET! },
    // Middleware only validates JWTs — DB adapters never touched here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapters: {} as any,
    tokens: { cookiePrefix: '<cookiePrefix>' },
  },
  protectAllExcept: [
    '/login',
    '/register',
    '/logout',
    '/password/forgot',
    '/password/reset',
    '/passkey/login',
    '/sso',
    '/2fa/verify',
    '/api/auth',
    '/_next',
    '/favicon.ico',
    // tRPC handles its own refresh — exclude if using tRPC:
    // '/api/trpc',
  ],
  signInPath: '/login',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

### Step 9 — Provider

Wrap `app/layout.tsx`:

```tsx
import { HoleauthProvider } from '@holeauth/react';
import { AUTH_BASE_PATH, COOKIE_PREFIX } from '@/lib/constants';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HoleauthProvider basePath={AUTH_BASE_PATH} cookiePrefix={COOKIE_PREFIX}>
          {children}
        </HoleauthProvider>
      </body>
    </html>
  );
}
```

---

### Step 10 — Env

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
3. **File is `proxy.ts` on Next.js 16+**, `middleware.ts` on Next.js 15 and earlier.
4. **Event name is `'user.registered'`** — NOT `'user.created'`. The other reliable events: `user.login`, `user.logout`, `user.invite_consumed`, `session.created`, `token.rotated`.
5. **`cookiePrefix` must match exactly** in three places: `createAuthHandler({ tokens })`, `holeauthMiddleware({ config: { tokens }})`, `<HoleauthProvider cookiePrefix>`.
6. **`core.tables` does NOT contain `users`** — that's app-owned. Adding it again to the schema spread produces a Drizzle duplicate-table error.
7. **`runtime = 'nodejs'`** on the route handler — `@node-rs/argon2` and scrypt-fallback need Node APIs.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=<topic>
```

Useful topics: `account-linking`, `token-rotation`, `csrf`, `events`, `audit-log`, `email-verification`, `password-reset`.
