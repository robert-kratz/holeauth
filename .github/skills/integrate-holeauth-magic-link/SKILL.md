---
name: integrate-holeauth-magic-link
description: "Add passwordless magic-link and email-OTP authentication to a holeauth project using @holeauth/plugin-magic-link and @holeauth/magic-link-drizzle. Use when: adding magic link, adding magic-link sign-in, adding email OTP, adding email one-time codes, adding passwordless login, adding email verification login. Requires integrate-holeauth-core to be completed first."
argument-hint: "Inherits dialect + usersTable from core skill"
domain: "authentication, holeauth, magic-link, otp, passwordless, plugins, drizzle, email"
---

# Integrate holeauth — Magic Link & Email OTP

Adds passwordless sign-in via `@holeauth/plugin-magic-link` and the Drizzle adapter. Supports one-click URL flow (`magic-link`), six-digit numeric OTP flow (`otp`), or both simultaneously.

## Prerequisites

`integrate-holeauth-core` must be complete. The `plugins` array, `users` table (with an `email` column and optional `emailVerified` column), and `db` client must already exist. The consumer must have a working transactional email sender.

## Source of truth

- Reference plugin wiring: `apps/playground/lib/auth.ts` (`magicLink({ adapter: magicLinkAdapter, ... })`) and `holeauth-test/src/lib/auth.ts`
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-magic-link`
- Drizzle adapter docs: `https://docs.holeauth.dev/docs/packages/plugin-magic-link/drizzle`
- Platform-specific getting-started: `https://docs.holeauth.dev/docs/getting-started/<framework>/plugin-magic-link`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Default |
|---|---|---|---|
| 1 | `mode` | radio | `magic-link` · `otp` · `both` |
| 2 | `role` | radio | `primary` · `secondFactor` |
| 3 | `useFor` | radio | `login` · `register` · `both` |
| 4 | `tokenTtlSeconds` | number | 600 |
| 5 | `otpLength` | number (4–10) | 6 |
| 6 | `resendCooldownSeconds` | number | 60 |
| 7 | `markEmailVerified` | boolean | true |
| 8 | `blockLoginBeforeEmailVerification` | boolean | false |
| 9 | `successRedirect` | path | `/dashboard` |
| 10 | `errorRedirect` | path | `/magic-link` |
| 11 | `expiredRedirect` | path | `/magic-link/expired` |
| 12 | `rateLimiter` | radio | In-memory (dev) · BYO distributed (production) |
| 13 | `emailProvider` | text | name of existing transactional email module |

---

### Step 2 — Install

```bash
pnpm add @holeauth/plugin-magic-link @holeauth/magic-link-drizzle
```

---

### Step 3 — Schema

Edit `db/schema.ts`:

```ts
import { createMagicLinkTables } from '@holeauth/magic-link-drizzle/<dialect>';

export const magicLinkSchema = createMagicLinkTables({ usersTable: users });

// Spread into the schema object:
export const schema = {
  ...core.tables,
  ...magicLinkSchema.tables,
  ...core.relations,
};
```

Ensure `users` has an `emailVerified` column (timestamp / `integer` for SQLite). Run `pnpm db:push` (or `drizzle-kit push`) after editing.

---

### Step 4 — Plugin registration

Edit `lib/auth.ts`:

```ts
import { magicLink } from '@holeauth/plugin-magic-link';
import { createMagicLinkAdapter } from '@holeauth/magic-link-drizzle/<dialect>';
import { magicLinkSchema } from '../db/schema';
import { sendTransactionalEmail } from '<emailProvider>';

const AUTH_BASE_PATH = '/api/auth'; // or '/auth' for Express/Hono
const magicLinkAdapter = createMagicLinkAdapter({ db, tables: magicLinkSchema.tables });

// In the plugins array (preserve `as const`):
const plugins = [
  magicLink({
    adapter: magicLinkAdapter,
    baseUrl: `${process.env.APP_URL}${AUTH_BASE_PATH}`,
    mode: '<mode>',
    role: '<role>',
    useFor: '<useFor>',
    tokenTtlSeconds: <tokenTtlSeconds>,
    otpLength: <otpLength>,
    resendCooldownSeconds: <resendCooldownSeconds>,
    markEmailVerified: <markEmailVerified>,
    blockLoginBeforeEmailVerification: <blockLoginBeforeEmailVerification>,
    successRedirect: '<successRedirect>',
    errorRedirect: '<errorRedirect>',
    expiredRedirect: '<expiredRedirect>',
    sendEmail: async ({ email, url, code, type }) => {
      if (type === 'magic-link') {
        await sendTransactionalEmail(email, 'Sign in', `Click to sign in: ${url}`);
      } else {
        await sendTransactionalEmail(email, 'Your sign-in code', `Code: ${code}`);
      }
    },
  }),
  // ...other plugins
] as const;
```

The plugin auto-registers these routes on the catch-all handler:

- `POST <basePath>/magic-link/request` — body `{ email, type? }`
- `GET  <basePath>/magic-link/consume?token=...` — sets session cookies; redirects on success/failure/expired
- `POST <basePath>/magic-link/verify-otp` — body `{ email, code }`

---

### Step 5 — API surface

The plugin appends a namespace to `auth`:

```ts
auth.magicLink.request({ email, type?, ip?, userAgent? })       // → { sent: boolean }
auth.magicLink.consume({ token, ip?, userAgent? })              // → { user, tokens }
auth.magicLink.verifyOtp({ email, code, ip?, userAgent? })      // → { user, tokens }
```

---

### Step 6 — Front-end pages

**The AI agent generates the request page and (if `mode === 'otp'` or `'both'`) the verify-OTP page in a platform-appropriate way.** Refer to:

- Platform docs: `https://docs.holeauth.dev/docs/getting-started/<framework>/plugin-magic-link`
- Reference request page: `holeauth-test/src/app/(guest)/magic-link/page.tsx`
- Reference expired page: `holeauth-test/src/app/(guest)/magic-link/expired/page.tsx`
- Reference verify page (OTP): `holeauth-test/src/app/(guest)/magic-link/verify/page.tsx`

For the magic-link URL flow, **no extra page is needed for consume** — clicking the link hits `GET <basePath>/magic-link/consume?token=…` server-side, which sets the cookies and redirects to `successRedirect`.

For the OTP flow, the verify page posts `{ email, code }` to `<basePath>/magic-link/verify-otp` and on `res.ok` navigates to `successRedirect`.

---

### Step 7 — Second-factor mode (optional)

If `role === 'secondFactor'`, the plugin emits a sign-in challenge instead of issuing tokens directly. Wire it like the 2FA plugin:

1. After password sign-in, the response carries `{ kind: 'pending', pluginId: 'magicLink', pendingToken }`.
2. Redirect the user to `/magic-link/verify` (cookie-based, no URL parameter).
3. The verify page submits the code or link click, completing sign-in.

`pendingTtlSeconds` controls how long the challenge is valid (defaults to `cfg.tokens.pendingTtl ?? 300`).

---

### Step 8 — Maintenance

Magic-link rows are not auto-pruned. Schedule a periodic call:

```ts
await magicLinkAdapter.deleteExpired();
```

Run it via cron, a scheduled function, or a queue worker — daily is sufficient.

---

## Hardcoded gotchas

1. **Only token *hashes* are stored.** SHA-256 (base64url). The raw value lives in the email — there is no `getToken()` API.
2. **`baseUrl` must be absolute and reachable.** It is used to construct the link in the email. Set it to `https://…/api/auth` in production so cookies set on `consume` carry `Secure`.
3. **Default rate limiter is in-memory** — replace with a distributed limiter (Redis-backed) for production. Pass via `requestLimiter` and `verifyLimiter`.
4. **`request()` is silently idempotent** while a valid token exists for the same email + type. The `resendCooldownSeconds` only kicks in *after* the previous token is consumed.
5. **`useFor: 'login'` returns `{ sent: true }` for unknown emails** without sending. This is intentional to prevent account enumeration.
6. **OTP and magic-link tokens share the same table** but differ by `type`. Switching `mode` does not require a migration.
7. **`successRedirect` / `errorRedirect` are GET-only** — they control `GET /magic-link/consume`. The POST verify-OTP route always returns JSON.
8. **CSRF is intentionally disabled** on `request` and `verify-otp` because the user has no session yet. Rate limiting is the protection layer.

---

## Verification checklist

```
[ ] DB migration applied after schema change: pnpm db:push
[ ] magicLink plugin appears in the plugins array with `as const`
[ ] POST <basePath>/magic-link/request returns { ok: true, sent: true } for a valid email
[ ] Email is received (or logged in dev sendEmail stub)
[ ] Clicking the magic link sets session cookies and redirects to successRedirect
[ ] (OTP mode) POST <basePath>/magic-link/verify-otp accepts the code and signs in
[ ] Expired token redirects to expiredRedirect (or errorRedirect when unset)
[ ] users.emailVerified is set on first successful sign-in (when markEmailVerified === true)
[ ] pnpm typecheck passes
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=magic+link+<topic>
```

Useful topics: `sendEmail`, `rate limiter`, `useFor`, `secondFactor`, `markEmailVerified`, `resendCooldownSeconds`, `consume token`, `OTP length`.
