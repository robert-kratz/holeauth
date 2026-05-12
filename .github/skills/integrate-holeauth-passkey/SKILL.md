---
name: integrate-holeauth-passkey
description: "Add Passkey (WebAuthn / FIDO2) authentication to a holeauth project using @holeauth/plugin-passkey and @holeauth/passkey-drizzle. Use when: adding passkeys, adding WebAuthn, adding biometric login, adding FIDO2, passwordless login, passkey registration. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Persistence: Drizzle (pg/mysql/sqlite) or headless PasskeyAdapter."
---

# Integrate holeauth — Passkeys (WebAuthn)

Covers `@holeauth/plugin-passkey` (factory: `passkey`) and `@holeauth/passkey-drizzle` (`createPasskeyTables`, `createPasskeyAdapter`).

> **Prerequisite**: `integrate-holeauth-core` already completed.

## Procedure

### Step 1 — Plugin-specific questions

1. **Relying Party display name** — `rpName` — free text (e.g. `"My App"`).
2. **Relying Party ID** — `rpID` — free text — domain only (no scheme/port). Use `localhost` for dev.
3. **Origin** — `rpOrigin` — full origin (`http://localhost:3000` or `https://app.example.com`).
4. **Role** — `passkeyRole` — `Primary login (passwordless)` | `Second factor / additional login option` *(default — both endpoints exist; use as you wish)*.
5. **Pending challenge TTL** — `passkeyPendingTtl` — seconds, default `300`.
6. **Rate limiter** — `passkeyRateLimiter` — `In-memory default` | `Custom stub`.
7. **Discoverable creds (resident keys)** — `passkeyDiscoverable` — `Preferred` *(default)* | `Required` | `Discouraged` (note: enforced by browser via `loginOptions(undefined)` flow).

### Step 2 — Install

```
@holeauth/plugin-passkey
@holeauth/passkey-drizzle      # only if Drizzle
@simplewebauthn/server         # peer
@simplewebauthn/browser        # client-side
```

### Step 3 — Drizzle schema

```ts title="db/schema.ts"
import { createPasskeyTables } from '@holeauth/passkey-drizzle/pg'; // swap dialect

export const passkeys = createPasskeyTables({ usersTable: users });
export const passkeyCredentials = passkeys.tables.passkeys;

export const schema = {
  ...core.tables,
  ...passkeys.tables,
};
```

### Step 4 — Register the plugin (fully-filled)

```ts title="lib/auth.ts"
import { passkey } from '@holeauth/plugin-passkey';
import { createPasskeyAdapter } from '@holeauth/passkey-drizzle/pg';
import { db } from '../db/client';
import { passkeys } from '../db/schema';

const passkeyAdapter = createPasskeyAdapter({ db, tables: passkeys.tables });

export const auth = createAuthHandler({
  // ...existing config
  plugins: [
    passkey({
      adapter: passkeyAdapter,
      rpID:     process.env.PASSKEY_RP_ID    ?? 'localhost',
      rpOrigin: process.env.APP_URL          ?? 'http://localhost:3000',
      rpName:   process.env.PASSKEY_RP_NAME  ?? 'holeauth App',
      pendingTtlSeconds: 300,
      // rateLimiter: createMemoryRateLimiter({ max: 10, windowMs: 5 * 60_000 }),
    }),
  ],
});
```

Auto-registered routes (under `<basePath>`):
- `POST /passkey/register/options` — registration challenge (auth required).
- `POST /passkey/register/verify` — store credential. Body: `{ response, deviceName? }`.
- `POST /passkey/login/options` — authentication challenge.
- `POST /passkey/login/verify` — verify and issue tokens. Body: `{ response }`.
- `GET  /passkey/list` — list registered passkeys (auth required).
- `POST /passkey/delete` — delete a passkey. Body: `{ credentialId }` (auth required).

### Step 5 — API surface (`auth.passkey`)

```ts
const { options, challenge } = await auth.passkey.registerOptions(userId);
await auth.passkey.registerVerify(userId, { response, expectedChallenge: challenge, deviceName: 'iPhone' });

const { options: loginOpts, challenge: loginCh } = await auth.passkey.loginOptions(/* userId? */);
const { user, tokens } = await auth.passkey.loginVerify({
  response, expectedChallenge: loginCh, ip, userAgent,
});

const list = await auth.passkey.list(userId);
await auth.passkey.delete(userId, credentialId);
```

### Step 6 — Client-side ceremony

```ts title="app/passkey/register.client.tsx"
import { startRegistration } from '@simplewebauthn/browser';

// Challenge is stored server-side in an httpOnly cookie — NOT returned in JSON.
const { options } = await fetch('/api/auth/passkey/register/options', {
  method: 'POST',
  headers: { 'x-csrf-token': csrfToken },
}).then(r => r.json());

const response = await startRegistration(options);

await fetch('/api/auth/passkey/register/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
  // ⚠ Do NOT send expectedChallenge — server reads it from the httpOnly cookie.
  body: JSON.stringify({ response, deviceName: 'My Laptop' }),
});
```

```ts title="app/passkey/login.client.tsx"
import { startAuthentication } from '@simplewebauthn/browser';

// Challenge is stored server-side in an httpOnly cookie — NOT returned in JSON.
const { options } = await fetch('/api/auth/passkey/login/options', {
  method: 'POST',
}).then(r => r.json());

const response = await startAuthentication(options);

const result = await fetch('/api/auth/passkey/login/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  // ⚠ Do NOT send expectedChallenge — server reads it from the httpOnly cookie.
  body: JSON.stringify({ response }),
}).then(r => r.json());
```

### Step 7 — Environment

```bash title=".env.local"
PASSKEY_RP_ID=localhost
PASSKEY_RP_NAME="My App"
APP_URL=http://localhost:3000
```

### Step 8 — Verify

- `register/options` returns a valid challenge; `register/verify` succeeds and a row appears in the passkeys table.
- `login/options` then `login/verify` returns access + refresh tokens.
- Counter replay protection: signing in twice with the same authenticator increments `signCount`.

## Headless variant

Implement `PasskeyAdapter` from `@holeauth/plugin-passkey`:
```ts
interface PasskeyAdapter {
  list(userId: string): Promise<PasskeyRecord[]>;
  getByCredentialId(credentialId: string): Promise<PasskeyRecord | null>;
  insert(record: PasskeyRecord): Promise<void>;
  updateCounter(credentialId: string, counter: number): Promise<void>;
  delete(userId: string, credentialId: string): Promise<void>;
}
```

## Key references

- `packages/plugin-passkey/src/index.ts` — `PasskeyOptions`, `PasskeyApi`
- `packages/passkey-drizzle/src/{pg,mysql,sqlite}/index.ts`
