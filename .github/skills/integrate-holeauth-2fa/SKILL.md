---
name: integrate-holeauth-2fa
description: "Add Two-Factor Authentication (TOTP / 2FA) to a holeauth project using @holeauth/plugin-2fa and @holeauth/2fa-drizzle. Use when: adding 2FA, adding TOTP, adding two-factor auth, adding OTP, setting up authenticator app support, recovery codes. Requires integrate-holeauth-core to be completed first."
argument-hint: "Inherits dialect + usersTable from core skill"
domain: "authentication, authorization, holeauth, 2fa, totp, otp, plugins, drizzle"
---

# Integrate holeauth — Two-Factor (TOTP)

Adds TOTP-based 2FA with recovery codes via `@holeauth/plugin-2fa` and the Drizzle adapter.

## Prerequisites

`integrate-holeauth-core` must be complete. The `plugins` array, `users` table, and `db` client must already exist.

## Source of truth

- Reference plugin wiring: `apps/playground/lib/auth.ts` (line `twofa({ adapter: twoFactorAdapter, ... })`)
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-2fa`
- Platform-specific getting-started: `https://docs.holeauth.dev/docs/getting-started/<framework>/plugin-2fa`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Default |
|---|---|---|---|
| 1 | `issuer` | text | App name (shown in authenticator app) |
| 2 | `recoveryCodeCount` | number | 10 |
| 3 | `pendingTtlSeconds` | number | 300 |
| 4 | `enrollmentPolicy` | radio | Optional · Required for new users · Required for specific RBAC group |
| 5 | `rateLimiter` | radio | In-memory (dev) · BYO distributed (production) |

---

### Step 2 — Install

```bash
pnpm add @holeauth/plugin-2fa @holeauth/2fa-drizzle
```

---

### Step 3 — Schema

Edit `db/schema.ts`:

```ts
import { createTwoFactorTables } from '@holeauth/2fa-drizzle/<dialect>';

export const twoFa = createTwoFactorTables({ usersTable: users });
export const twoFactor = twoFa.tables.twoFactor;

// Spread into the schema object:
export const schema = {
  ...core.tables,
  ...twoFa.tables,
  ...core.relations,
};
```

Run `pnpm db:push` (or `drizzle-kit push`) after editing.

---

### Step 4 — Plugin registration

Edit `lib/auth.ts`:

```ts
import { twofa } from '@holeauth/plugin-2fa';
import { createTwoFactorAdapter } from '@holeauth/2fa-drizzle/<dialect>';
import { twoFa } from '../db/schema';

const twoFactorAdapter = createTwoFactorAdapter({ db, tables: twoFa.tables });

// In the plugins array (preserve `as const`):
const plugins = [
  twofa({
    adapter: twoFactorAdapter,
    issuer: '<issuer>',
    recoveryCodeCount: <recoveryCodeCount>,
    pendingTtlSeconds: <pendingTtlSeconds>,
  }),
  // ...other plugins
] as const;
```

The plugin auto-registers these routes on the catch-all handler:

- `POST <basePath>/2fa/setup`
- `POST <basePath>/2fa/activate`
- `POST <basePath>/2fa/verify`
- `POST <basePath>/2fa/disable`
- `GET  <basePath>/2fa/render-qr`

---

### Step 5 — API surface

The plugin appends a namespace to `auth`:

```ts
auth.twofa.setup(userId)                      // → { secret, otpauthUrl, qrCodeDataUrl }
auth.twofa.activate(userId, code)             // → { recoveryCodes: string[] }
auth.twofa.isEnabled(userId)                  // → boolean
auth.twofa.disable(userId)
auth.twofa.verify({ pendingToken, code, ip?, userAgent? }) // → tokens
auth.twofa.renderQrDataUrl(otpauthUrl)
auth.twofa.renderQrBuffer(otpauthUrl)
```

---

### Step 6 — Sign-in flow integration

After a normal password sign-in, the response may include a `pending` state when 2FA is required. The sign-in result shape:

```ts
// Returned by useSignIn() from @holeauth/react, or by POST <basePath>/signin
{
  kind: 'pending',
  pluginId: 'twofa',
  pendingToken: string,  // short-lived, single-use
}
```

The `pendingToken` is automatically stored as a `holeauth.pending` HttpOnly cookie — no URL parameter is needed. When the challenge is received, redirect the user to the dedicated `/2fa/verify` page using `onPending`:

```tsx title="app/(guest)/login/page.tsx (headless)"
<SignInForm.Root
  onSuccess={() => router.push('/')}
  onPending={() => router.push('/2fa/verify')}
>
  ...
</SignInForm.Root>
```

The `/2fa/verify` page uses `TwoFactorVerifyForm` (from `@holeauth/react-ui`) to collect and submit the code. No `pendingToken` prop is required — the form reads the cookie automatically.

**Do not** render `TwoFactorVerifyForm` inline inside the login page. Always redirect to the dedicated verify page.

**The AI agent generates the login page and the `/2fa/verify` page in a platform-appropriate way.** Refer to:
- Platform docs: `https://docs.holeauth.dev/docs/getting-started/<framework>/plugin-2fa`
- Reference login page: `apps/playground/app/(guest)/login/page.tsx`
- Reference verify page: `apps/playground/app/2fa/verify/page.tsx`

---

### Step 7 — Recovery codes UX

The plugin exports helpers:

```ts
import {
  formatRecoveryCodesAsText,
  recoveryCodesToBlob,
  downloadRecoveryCodesAsTxt,
} from '@holeauth/plugin-2fa';

// Right after activate():
downloadRecoveryCodesAsTxt(result.recoveryCodes, 'recovery-codes.txt');
```

**Show recovery codes exactly once.** They cannot be retrieved later — only regenerated by disabling and re-enrolling.

---

### Step 8 — Enforcement (optional)

If `enrollmentPolicy === 'required for new users'`, add a server-side gate that redirects to `/2fa/setup` whenever `auth.twofa.isEnabled(userId)` is `false`.

If `enrollmentPolicy === 'required for specific RBAC group'`, also check `auth.rbac.getUserGroups(userId)` and only enforce for matching groups.

---

## Hardcoded gotchas

1. **Default rate limiter is in-memory** — replace with a distributed limiter (Redis-backed) for production. Pass via `rateLimiter` option.
2. **Recovery codes are shown exactly once** — UI must download/copy them at activation time. There is no `getRecoveryCodes()` API.
3. **`pendingToken` is single-use** — re-submitting an expired token returns `pending_expired`. When using `TwoFactorVerifyForm` from `@holeauth/react-ui` this is handled automatically. For raw fetch / server-side code: surfacing this error and restarting sign-in is the caller's responsibility.
4. **The headless `TwoFactorAdapter` interface** is: `getByUserId(userId)`, `upsert(record)`, `delete(userId)`. Use this only if not using the Drizzle adapter.

---

## Verification checklist

```
[ ] DB migration applied after schema change: pnpm db:push
[ ] twofa plugin appears in the plugins array with `as const`
[ ] POST <basePath>/2fa/setup responds (requires active session)
[ ] /2fa/verify page exists and is reachable without authentication
[ ] QR code renders correctly in an authenticator app
[ ] TOTP code accepted and session fully established after verify
[ ] Recovery codes displayed after activation
[ ] pnpm typecheck passes
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=2fa+<topic>
```

Useful topics: `enrollment policy`, `recovery codes`, `pending token`, `rate limiter`.
