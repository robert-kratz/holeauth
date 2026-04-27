---
name: integrate-holeauth-core
description: "Set up the holeauth core packages in a project: @holeauth/core, @holeauth/adapter-drizzle, @holeauth/nextjs, @holeauth/react. Use when: installing holeauth core, setting up auth instance, creating Drizzle schema for auth, wiring Next.js route handler, adding HoleauthProvider."
argument-hint: "PostgreSQL / MySQL / SQLite, Next.js App Router"
---

# Integrate holeauth — Core Setup

Covers `@holeauth/core`, `@holeauth/adapter-drizzle`, `@holeauth/nextjs`, `@holeauth/react`.

## Procedure

### Step 1 — Clarify requirements

Use `vscode/askQuestions` to ask:

1. **Database dialect** — Which database are you using?
   - Options: PostgreSQL, MySQL, SQLite
   - *Determines which adapter sub-path to import.*

2. **Existing user table** — Do you have an existing users table in your Drizzle schema?
   - Options: Yes — show me the table definition, No — create a new one

3. **Environment** — Where do you store secrets?
   - Options: `.env.local` (Next.js default), `.env`, Custom / Vault

4. **Base path** — What path should auth endpoints live at?
   - Options: `/api/auth` (default), Custom path
   - *Affects `basePath` and `<HoleauthProvider basePath>` value.*

5. **Session duration** — How long should access tokens live?
   - Options: 15 minutes (default), 1 hour, Custom

### Step 2 — Install packages

Based on the chosen dialect (`pg` | `mysql` | `sqlite`), install:

```
@holeauth/core
@holeauth/adapter-drizzle        # sub-path: /pg  /mysql  /sqlite
@holeauth/nextjs
@holeauth/react
```

Show the install command using the user's package manager. Default to `pnpm add`.

### Step 3 — Drizzle schema

**If the user has an existing table**: ask them to paste or point to its definition, then compose on top of it.

**If starting fresh**: generate a `pgTable` / `mysqlTable` / `sqliteTable` named `app_users` with columns:
`id` (uuid/text pk), `email` (unique), `name`, `image`, `emailVerified`, `passwordHash`, `createdAt`.

Then call `createHoleauthTables({ usersTable: users })` from `@holeauth/adapter-drizzle/<dialect>` and merge into the exported schema:

```ts title="db/schema.ts"
import { createHoleauthTables } from '@holeauth/adapter-drizzle/pg';
// ...
const core = createHoleauthTables({ usersTable: users });
export const schema = { ...users, ...core.tables };
```

Run or remind the user to run `drizzle-kit push` / `drizzle-kit generate` + `migrate`.

### Step 4 — Auth instance

Create `lib/auth.ts` (or the user's preferred path):

```ts title="lib/auth.ts"
import { defineHoleauth } from '@holeauth/core';
import { drizzleAdapter } from '@holeauth/adapter-drizzle/pg'; // swap dialect
import { db } from '@/db';

export const auth = defineHoleauth({
  adapter: drizzleAdapter(db),
  secrets: {
    jwtSecret: process.env.HOLEAUTH_SECRET!,
  },
  // session: { accessTokenTTL: 60 * 15 },  // optional
});
```

Remind the user to set `HOLEAUTH_SECRET` (≥ 32 random characters) in their env file.

### Step 5 — Route handler (Next.js App Router)

Create `app/api/auth/[...holeauth]/route.ts`:

```ts title="app/api/auth/[...holeauth]/route.ts"
import { auth } from '@/lib/auth';
import { toNextRouteHandler } from '@holeauth/nextjs';

export const { GET, POST } = toNextRouteHandler(auth);
```

### Step 6 — Middleware (optional session refresh)

If the user wants session refresh on every request, add to `middleware.ts`:

```ts title="middleware.ts"
import { createHoleauthMiddleware } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export const middleware = createHoleauthMiddleware(auth);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Step 7 — React provider

Wrap the app in `<HoleauthProvider>` inside the root layout:

```tsx title="app/layout.tsx"
import { HoleauthProvider } from '@holeauth/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <HoleauthProvider basePath="/api/auth">
          {children}
        </HoleauthProvider>
      </body>
    </html>
  );
}
```

### Step 8 — Verify

- Run the dev server (`pnpm dev`).
- `GET /api/auth/session` should return `null` (no active session).
- `POST /api/auth/register` with `{ email, password, name }` should create a user.
- `POST /api/auth/signin/password` should return `{ accessToken, refreshToken }`.

## Key references

- Playground integration pattern: `apps/playground/db/schema.ts`, `apps/playground/lib/auth.ts`, `apps/playground/app/api/auth/[...holeauth]/route.ts`
- Server-side session guard: `validateCurrentRequest(auth, { permissions?, loadUser?, redirectTo? })`
