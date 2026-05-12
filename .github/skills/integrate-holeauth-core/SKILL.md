---
name: integrate-holeauth-core
description: "Set up the holeauth core packages in a project: @holeauth/core, @holeauth/adapter-drizzle, @holeauth/nextjs, @holeauth/react. Use when: installing holeauth core, setting up auth instance, creating Drizzle schema for auth, wiring Next.js route handler, adding HoleauthProvider, choosing headless adapters."
argument-hint: "Persistence: Drizzle (pg/mysql/sqlite) or headless. Framework: Next.js / React / Vue / Node / Edge."
---

# Integrate holeauth — Core Setup

Covers `@holeauth/core`, `@holeauth/adapter-drizzle`, `@holeauth/nextjs`, `@holeauth/react`. Always emit a fully-filled `createAuthHandler({ ... })` config so every supported option is visible.

## Procedure

### Step 1 — Inherit answers from the entry skill

Reuse answers from `integrate-holeauth/SKILL.md` Step 1 if present (`framework`, `persistence`, `usersTable`, `ssoProviders`, `registration`, `basePath`, `middleware`, `envFile`). Only ask the questions below if they are missing.

### Step 2 — Clarify (only if not already answered)

Use `vscode/askQuestions`:

1. **Persistence** — `persistence`
   - `Drizzle PostgreSQL` *(default)* | `Drizzle MySQL` | `Drizzle SQLite` | `Headless (implement Adapter interfaces)`
2. **Existing users table** — `usersTable`
   - `Yes — paste/point me to it` | `Scaffold app_users`
3. **Cookie prefix** — `cookiePrefix` — free text, default `holeauth`
4. **Access TTL** — `accessTtl` — `900` (15m, default) | `3600` (1h) | custom seconds
5. **Refresh TTL** — `refreshTtl` — `2592000` (30d default) | custom seconds
6. **`allowDangerousEmailAccountLinking`** — yes / **no** (default no)
7. **Built-in SSO providers** — `ssoProviders` — Google / GitHub / None (multi-select)
8. **Logger** — `silent` / verbose

### Step 3 — Install

Always:
```
@holeauth/core
@holeauth/nextjs           # only if framework === Next.js
@holeauth/react            # only if framework uses React (Next.js or RSC/Vite)
```

For Drizzle:
| Dialect | Add |
|---|---|
| pg | `@holeauth/adapter-drizzle drizzle-orm pg drizzle-kit @types/pg` |
| mysql | `@holeauth/adapter-drizzle drizzle-orm mysql2 drizzle-kit` |
| sqlite | `@holeauth/adapter-drizzle drizzle-orm better-sqlite3 drizzle-kit @types/better-sqlite3` |

For headless: skip `@holeauth/adapter-drizzle`. The user will implement `UserAdapter`, `SessionAdapter`, `AccountAdapter`, `VerificationTokenAdapter`, `AuditLogAdapter`, optional `TransactionAdapter` from `@holeauth/core/adapters`.

### Step 4 — Drizzle schema (skip if headless)

Compose tables on top of the user-owned users table. **Always export every table set** so later plugins can mount cleanly without touching this file.

```ts title="db/schema.ts"
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'; // swap dialect
import { createHoleauthTables } from '@holeauth/adapter-drizzle/pg';

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

export const sessions             = core.tables.sessions;
export const accounts             = core.tables.accounts;
export const verificationTokens   = core.tables.verificationTokens;
export const auditLog             = core.tables.auditLog;

export const schema = {
  ...core.tables,
  ...core.relations,
};
```

If a plugin is selected, that plugin's skill appends its own `createXxxTables(...)` call here and merges into `schema`.

### Step 5 — DB client

```ts title="db/client.ts"
import { drizzle } from 'drizzle-orm/node-postgres'; // swap per dialect
import { Pool } from 'pg';
import { schema } from './schema';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
```

### Step 6 — Auth instance (Next.js — fully-filled config)

```ts title="lib/auth.ts"
import { createAuthHandler } from '@holeauth/nextjs';
import { GoogleProvider, GithubProvider } from '@holeauth/core/sso';
import { createHoleauthAdapters } from '@holeauth/adapter-drizzle/pg'; // swap dialect
import { db } from '../db/client';
import { core } from '../db/schema';

const adapters = createHoleauthAdapters({ db, tables: core.tables });

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const providers = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${APP_URL}/api/auth/callback/google`,
  }));
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(GithubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: `${APP_URL}/api/auth/callback/github`,
  }));
}

export const auth = createAuthHandler({
  secrets: {
    jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me-please',
  },
  adapters: {
    user: adapters.user,
    session: adapters.session,
    account: adapters.account,
    auditLog: adapters.auditLog,
    verificationToken: adapters.verificationToken,
    transaction: adapters.transaction,
  },
  tokens: {
    accessTtl: 60 * 15,        // 15m
    refreshTtl: 60 * 60 * 24 * 30, // 30d
    pendingTtl: 60 * 5,        // 5m  — used by 2FA / passkey challenges
    cookiePrefix: 'holeauth',
    // cookieDomain: '.example.com',
    // cookieSecure: true,
    sameSite: 'lax',
  },
  providers, // built-in SSO consumers (Google/GitHub) — empty array if none
  plugins: [], // filled by per-plugin skills
  pluginAdapters: {}, // filled by per-plugin skills
  allowDangerousEmailAccountLinking: false,
  registration: {
    selfServe: process.env.REGISTRATION_SELF_SERVE !== 'false',
    inviteTtlSeconds: 7 * 24 * 60 * 60,
    inviteUrl: ({ token }) =>
      `${APP_URL}/register/accept?token=${encodeURIComponent(token)}`,
  },
  logger: { silent: false },
  onEvent: (e) => {
    // eslint-disable-next-line no-console
    console.log('[holeauth:event]', e.type, { userId: e.userId, sid: e.sessionId });
  },
});

// Example: hook framework — also see plugin-specific subscribers below.
// Use auth.on() — shorthand for subscribe(), avoids barrel/subpath WeakMap issue.
// ⚠ Event is 'user.registered' (NOT 'user.created').
auth.on('user.registered', async (_e) => {
  // attach welcome email, audit, default group assignment, etc.
});
```

### Step 7 — Route handler (Next.js App Router)

```ts title="app/api/auth/[...holeauth]/route.ts"
import { auth } from '@/lib/auth';

export const { GET, POST } = auth.handlers;
```

### Step 8 — Middleware (per Q `middleware`)

`Yes — protectAllExcept`:

```ts title="middleware.ts"
import { holeauthMiddleware } from '@holeauth/nextjs/middleware';

export default holeauthMiddleware({
  config: {
    secrets: { jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me-please' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapters: {} as any, // middleware only validates JWT; full adapters not needed
    tokens: { cookiePrefix: 'holeauth' },
  },
  protectAllExcept: [
    '/login', '/register', '/logout',
    '/password/forgot', '/password/reset',
    '/passkey/login', '/sso',
    '/2fa/verify',
    '/api/auth',
    '/api/trpc', // if tRPC handles its own auth + refresh in createTrpcContext
    '/_next', '/favicon.ico',
  ],
  signInPath: '/login',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Step 9 — React provider

```tsx title="app/layout.tsx"
import { HoleauthProvider } from '@holeauth/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <HoleauthProvider basePath="/api/auth" cookiePrefix="holeauth">
          {children}
        </HoleauthProvider>
      </body>
    </html>
  );
}
```

For non-Next.js React (Vite / SPA): same provider, point `basePath` at the absolute URL of your auth host.

For Vue.js / non-React: skip this step. Use `@holeauth/core` directly on the server and a thin client over `fetch` against `<basePath>/session`, `<basePath>/signin/password`, etc.

### Step 10 — Environment variables

```bash title=".env.local"
DATABASE_URL="postgres://user:pass@localhost:5432/app"
HOLEAUTH_SECRET="<openssl rand -base64 48>"
APP_URL="http://localhost:3000"
# Built-in SSO (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# Registration
REGISTRATION_SELF_SERVE=true
```

### Step 11 — Verify

- `pnpm db:generate && pnpm db:push` succeeds.
- `pnpm dev` boots.
- `GET /api/auth/session` → `null` for anonymous request.
- `POST /api/auth/register` with `{ email, password, name }` → 200 + cookies set.
- `POST /api/auth/signin/password` → `{ accessToken, refreshToken, csrfToken, ... }`.
- Server-side helper `auth.getSession()` works inside an RSC.

## Headless variant (no Drizzle)

If `persistence === 'Headless'`, skip Steps 4–5 and replace the `adapters` block in Step 6 with hand-implemented adapter objects:

```ts
import type {
  UserAdapter, SessionAdapter, AccountAdapter,
  VerificationTokenAdapter, AuditLogAdapter, TransactionAdapter,
} from '@holeauth/core/adapters';

const user: UserAdapter = { /* getUserById, getUserByEmail, createUser, updateUser, deleteUser */ };
const session: SessionAdapter = { /* createSession, getSession, getByRefreshHash, findByFamily, deleteSession, rotateRefresh, revokeFamily, revokeUser? */ };
const account: AccountAdapter = { /* link/unlink/list */ };
const verificationToken: VerificationTokenAdapter = { /* create, consume */ };
const auditLog: AuditLogAdapter = { append: async (event) => { /* persist */ } };
```

## Key references

- `apps/playground/lib/auth.ts`, `apps/playground/db/schema.ts`, `apps/playground/db/client.ts`
- `apps/playground/middleware.ts`
- `packages/core/src/types/index.ts` — `HoleauthConfig`, `TokenPolicy`, `RegistrationConfig`
- `packages/adapter-drizzle/src/{pg,mysql,sqlite}/index.ts` — `createHoleauthTables`, `createHoleauthAdapters`
