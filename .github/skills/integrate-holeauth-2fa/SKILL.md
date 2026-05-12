---
name: integrate-holeauth-2fa
description: "Add Two-Factor Authentication (TOTP / 2FA) to a holeauth project using @holeauth/plugin-2fa and @holeauth/2fa-drizzle. Use when: adding 2FA, adding TOTP, adding two-factor auth, adding OTP, setting up authenticator app support. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Persistence: Drizzle (pg/mysql/sqlite) or headless TwoFactorAdapter."
---

# Integrate holeauth — Two-Factor Authentication (2FA)

Covers `@holeauth/plugin-2fa` (factory: `twofa`) and `@holeauth/2fa-drizzle` (`createTwoFactorTables`, `createTwoFactorAdapter`).

> **Prerequisite**: `integrate-holeauth-core` already completed. Reuse `persistence`, `usersTable`, `framework` answers.

## Procedure

### Step 1 — Plugin-specific questions (`vscode/askQuestions`)

1. **Issuer label** — `twofaIssuer` — free text — shown inside Google Authenticator etc. Default `<App name>`.
2. **Recovery code count** — `twofaRecoveryCount` — `10` (default) | `5` | `0` (disable).
3. **Pending challenge TTL** — `twofaPendingTtl` — seconds, default `300`.
4. **Enrollment policy** — `twofaPolicy` — single select
   - `Opt-in` *(default)* | `Required for all users` | `Required for specific RBAC groups`
5. **Rate limiter** — `twofaRateLimiter` — `In-memory (default; replace in prod)` | `Custom (Redis/etc.) — leave stub`
6. **QR rendering** — `twofaQr` — `Server data URL via twofa.setup() (default)` | `Server PNG buffer route` | `Client-side qrcode lib`

### Step 2 — Install

```
@holeauth/plugin-2fa
@holeauth/2fa-drizzle    # only if persistence === Drizzle
```

### Step 3 — Drizzle schema (skip if headless)

```ts title="db/schema.ts"
import { createTwoFactorTables } from '@holeauth/2fa-drizzle/pg'; // swap dialect

export const twoFa = createTwoFactorTables({ usersTable: users });
export const twoFactor = twoFa.tables.twoFactor;

export const schema = {
  ...core.tables,
  ...twoFa.tables,
  // ... other plugin tables
};
```

Run `pnpm db:generate && pnpm db:push`.

### Step 4 — Register the plugin (fully-filled)

```ts title="lib/auth.ts"
import { twofa } from '@holeauth/plugin-2fa';
import { createTwoFactorAdapter } from '@holeauth/2fa-drizzle/pg'; // or implement adapter manually
import { db } from '../db/client';
import { twoFa } from '../db/schema';

const twoFactorAdapter = createTwoFactorAdapter({ db, tables: twoFa.tables });

export const auth = createAuthHandler({
  // ... existing config
  plugins: [
    twofa({
      adapter: twoFactorAdapter,
      issuer: process.env.APP_NAME ?? 'holeauth App',
      recoveryCodeCount: 10,
      pendingTtlSeconds: 300,
      // rateLimiter: createMemoryRateLimiter({ max: 5, windowMs: 5 * 60_000 }),
    }),
  ],
});
```

The plugin auto-registers (under `<basePath>`):
- `POST /2fa/verify` — exchange `pendingToken + code` for tokens.
- `POST /2fa/setup` — start enrollment (auth required).
- `POST /2fa/activate` — finalise enrollment with first code.
- `POST /2fa/disable` — disable with current code.
- `GET  /2fa/render-qr?payload=...` — PNG buffer.

### Step 5 — API surface (`auth.twofa`)

```ts
const { secret, otpauthUrl, qrCodeDataUrl } = await auth.twofa.setup(userId);
const { recoveryCodes }                     = await auth.twofa.activate(userId, code);
const enabled                               = await auth.twofa.isEnabled(userId);
await auth.twofa.disable(userId, code);
const { user, tokens } = await auth.twofa.verify({ pendingToken, code, ip, userAgent });
const dataUrl = await auth.twofa.renderQrDataUrl(otpauthUrl);
const buffer  = await auth.twofa.renderQrBuffer(otpauthUrl);
```

`signIn()` returns `kind: 'pending'` with `pluginId: 'twofa'` when 2FA is enabled.

### Step 6 — Sign-in challenge flow

```tsx
'use client';
import { useSignIn } from '@holeauth/react';

const { signIn } = useSignIn();
const result = await signIn({ email, password });
if (result?.kind === 'pending' && result.pluginId === 'twofa') {
  // navigate to /2fa/verify with result.pendingToken
}
```

Server route to verify (or use plugin route directly):
```ts
const { user, tokens } = await auth.twofa.verify({
  pendingToken,
  code,
  ip: req.headers.get('x-forwarded-for') ?? undefined,
  userAgent: req.headers.get('user-agent') ?? undefined,
});
```

### Step 7 — Recovery codes UI

After `activate()`, show the returned `recoveryCodes` exactly once. Helper utilities:

```ts
import {
  formatRecoveryCodesAsText,
  recoveryCodesToBlob,
  downloadRecoveryCodesAsTxt,
} from '@holeauth/plugin-2fa';
```

### Step 8 — Enforcement (Q4)

- `Required for all users` — gate `/login` or root layout server-side: redirect to `/2fa/setup` if `auth.twofa.isEnabled(userId)` returns `false`.
- `Required for RBAC groups` — combine with the rbac plugin: `if (await auth.rbac.canAny(userId, ['admin.*']) && !await auth.twofa.isEnabled(userId)) redirect('/2fa/setup')`.

### Step 9 — Verify

- `setup` returns valid `otpauthUrl`.
- `activate` succeeds with current TOTP and emits 10 recovery codes.
- Sign-in returns `pending` afterwards.
- `verify` exchanges valid code for tokens; wrong code → 401; rate limit kicks in after the configured window.

## Headless variant

Implement `TwoFactorAdapter` from `@holeauth/plugin-2fa`:
```ts
interface TwoFactorAdapter {
  getByUserId(userId: string): Promise<TwoFactorRecord | null>;
  upsert(record: TwoFactorRecord): Promise<void>;
  delete(userId: string): Promise<void>;
}
```

## Key references

- `packages/plugin-2fa/src/index.ts` — `TwoFactorOptions`, `TwoFactorApi`
- `packages/2fa-drizzle/src/{pg,mysql,sqlite}/index.ts`
