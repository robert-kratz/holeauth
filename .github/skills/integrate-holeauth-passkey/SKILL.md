---
name: integrate-holeauth-passkey
description: "Add Passkey (WebAuthn / FIDO2) authentication to a holeauth project using @holeauth/plugin-passkey and @holeauth/passkey-drizzle. Use when: adding passkeys, adding WebAuthn, adding biometric login, adding FIDO2, passwordless login, passkey registration. Requires integrate-holeauth-core to be completed first."
argument-hint: "Inherits dialect + usersTable from core skill"
---

# Integrate holeauth — Passkeys (WebAuthn)

Adds passkey registration and login via `@holeauth/plugin-passkey` and the Drizzle adapter.

## Prerequisites

`integrate-holeauth-core` must be complete.

## Source of truth

- Reference: `apps/playground/lib/auth.ts` (line `passkey({ adapter: passkeyPluginAdapter, ... })`)
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-passkey`, `https://docs.holeauth.dev/docs/getting-started/nextjs-app-router/plugin-passkey`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Notes |
|---|---|---|---|
| 1 | `rpName` | text | Display name shown by the OS (e.g. "Acme Corp") |
| 2 | `rpID` | text | Domain ONLY — no scheme, no port. `localhost` for dev, `app.example.com` for prod |
| 3 | `rpOrigin` | text | Full origin: `http://localhost:3000` or `https://app.example.com` |
| 4 | `role` | radio | Primary (passwordless) · Secondary factor (after password) |
| 5 | `pendingTtlSeconds` | number | 300 |
| 6 | `discoverable` | radio | Yes (recommended) · No (requires userId hint) |

**Critical interview validation:** if `rpID` contains `://` or a port, reject and re-ask. WebAuthn will silently fail at runtime otherwise.

---

### Step 2 — Install

```bash
pnpm add @holeauth/plugin-passkey @holeauth/passkey-drizzle
pnpm add @simplewebauthn/server @simplewebauthn/browser
```

`@simplewebauthn/server` is a peer dependency. **The plugin throws `PASSKEY_NOT_CONFIGURED` (HTTP 500) at runtime if it's missing.**

---

### Step 3 — Schema

Edit `db/schema.ts`:

```ts
import { createPasskeyTables } from '@holeauth/passkey-drizzle/<dialect>';

export const passkeys = createPasskeyTables({ usersTable: users });
export const passkeyCredentials = passkeys.tables.passkeys;

export const schema = {
  ...core.tables,
  ...passkeys.tables,
  ...core.relations,
};
```

Run `pnpm db:push`.

---

### Step 4 — Plugin registration

Edit `lib/auth.ts`:

```ts
import { passkey } from '@holeauth/plugin-passkey';
import { createPasskeyAdapter } from '@holeauth/passkey-drizzle/<dialect>';
import { passkeys } from '../db/schema';

const passkeyAdapter = createPasskeyAdapter({ db, tables: passkeys.tables });

const plugins = [
  passkey({
    adapter: passkeyAdapter,
    rpID: process.env.PASSKEY_RP_ID ?? 'localhost',
    rpName: '<rpName>',
    rpOrigin: process.env.APP_URL ?? 'http://localhost:3000',
    pendingTtlSeconds: <pendingTtlSeconds>,
  }),
  // ...other plugins
] as const;
```

Auto-registered routes:

- `POST <basePath>/passkey/register/options`
- `POST <basePath>/passkey/register/verify`
- `POST <basePath>/passkey/login/options`
- `POST <basePath>/passkey/login/verify`
- `GET  <basePath>/passkey/list`
- `POST <basePath>/passkey/delete`

---

### Step 5 — API surface

```ts
auth.passkey.registerOptions(userId)
auth.passkey.registerVerify(userId, { response, deviceName? })
auth.passkey.loginOptions(userId?)
auth.passkey.loginVerify({ response, ip?, userAgent? })
auth.passkey.list(userId)        // → PasskeyRecord[]
auth.passkey.delete(userId, credentialId)
```

---

### Step 6 — Client-side ceremony

Register flow (client component):

```tsx
'use client';
import { startRegistration } from '@simplewebauthn/browser';

async function enrollPasskey(deviceName: string) {
  const optionsRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
  const { options } = await optionsRes.json();

  // Browser shows the OS prompt:
  const credential = await startRegistration(options);

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: credential, deviceName }),
  });
  return verifyRes.json();
}
```

Login flow:

```tsx
'use client';
import { startAuthentication } from '@simplewebauthn/browser';

async function loginWithPasskey() {
  const optionsRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
  const { options } = await optionsRes.json();
  const assertion = await startAuthentication(options);
  return fetch('/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: assertion }),
  });
}
```

---

## Hardcoded gotchas

1. **`rpID` is the domain ONLY.** Never include `http://`, `https://`, or `:3000`. `localhost` for dev, bare domain for prod.
2. **`rpOrigin` is the full origin** including scheme and port. They are NOT the same field.
3. **Do NOT send `expectedChallenge` from the client.** The server reads it from the short-lived httpOnly cookie `<cookiePrefix>.passkey.challenge` (300s TTL). Sending it from the client is a security regression.
4. **`@simplewebauthn/server` is a peer dependency** — runtime error `PASSKEY_NOT_CONFIGURED` (500) if missing.
5. **The headless `PasskeyAdapter` interface** is: `list(userId)`, `getByCredentialId(id)`, `insert(record)`, `updateCounter(id, counter)`, `delete(userId, id)`.
6. **Cross-device/cross-origin:** if your prod domain differs from dev (e.g. `localhost` vs `app.example.com`), credentials enrolled in one will not authenticate in the other. This is a WebAuthn spec invariant.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=passkey+<topic>
```

Useful topics: `discoverable credentials`, `attestation`, `rp ID`, `device name`.
