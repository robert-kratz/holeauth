---
name: integrate-holeauth-passkey
description: "Add Passkey (WebAuthn / FIDO2) authentication to a holeauth project using @holeauth/plugin-passkey and @holeauth/passkey-drizzle. Use when: adding passkeys, adding WebAuthn, adding biometric login, adding FIDO2, passwordless login, passkey registration. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Database dialect: PostgreSQL / MySQL / SQLite"
---

# Integrate holeauth — Passkeys (WebAuthn)

Covers `@holeauth/plugin-passkey` and `@holeauth/passkey-drizzle`.

> **Prerequisite**: Core setup must be complete (`integrate-holeauth-core`). If not done yet, load that skill first.

## Procedure

### Step 1 — Clarify requirements

Use `vscode/askQuestions` to ask:

1. **Database dialect** — Which database are you using?
   - Options: PostgreSQL, MySQL, SQLite

2. **Relying Party name** — What is the human-readable name of your application that will appear in the passkey dialog?
   - Free text — e.g. `"My App"`.

3. **Relying Party ID** — What is the domain (RP ID) for passkeys?
   - Free text — must match the domain where passkeys will be used, e.g. `"myapp.com"` or `"localhost"`.
   - *`localhost` works for development.*

4. **Origin** — What is the full origin (protocol + domain + port) of your app?
   - Free text — e.g. `"https://myapp.com"` or `"http://localhost:3000"`.
   - *Must exactly match what the browser sends.*

5. **Passkey-only vs. fallback** — Should passkeys be the only login method, or a second factor alongside password?
   - Options: Primary login method (passwordless), Second factor / additional login option

6. **User verification** — Require biometric / PIN verification?
   - Options: Preferred (default — browser decides), Required (always require verification), Discouraged

### Step 2 — Install

```
@holeauth/plugin-passkey
@holeauth/passkey-drizzle
```

Also install the WebAuthn peer dependency if not already present:

```
@simplewebauthn/server
@simplewebauthn/browser   # for client-side
```

### Step 3 — Extend Drizzle schema

```ts title="db/schema.ts"
import { createPasskeyTables } from '@holeauth/passkey-drizzle/pg'; // swap dialect

const passkeys = createPasskeyTables({ usersTable: users });

export const schema = {
  ...core.tables,
  ...passkeys.tables,
};
```

Run migrations after this change.

### Step 4 — Register the plugin

```ts title="lib/auth.ts"
import { passkeyPlugin } from '@holeauth/plugin-passkey';
import { drizzlePasskeyAdapter } from '@holeauth/passkey-drizzle/pg'; // swap dialect
import { db } from '@/db';

export const auth = defineHoleauth({
  // ...existing config
  plugins: [
    passkeyPlugin({
      adapter: drizzlePasskeyAdapter(db),
      rpName: 'My App',
      rpId: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
      origin: process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000',
      // userVerification: 'preferred',
    }),
  ],
});
```

The plugin auto-registers these routes:
- `GET  /api/auth/passkey/register/options` — generate registration challenge
- `POST /api/auth/passkey/register/verify` — verify and store credential
- `GET  /api/auth/passkey/login/options` — generate authentication challenge
- `POST /api/auth/passkey/login/verify` — verify and issue session

### Step 5 — API surface (server-side)

```ts
// List a user's registered passkeys
const list = await auth.passkey.list(userId);

// Delete a passkey
await auth.passkey.delete(userId, credentialId);

// Direct programmatic registration (advanced)
const opts = await auth.passkey.registerOptions(userId);
const verified = await auth.passkey.registerVerify(userId, response);

// Direct login (advanced)
const loginOpts = await auth.passkey.loginOptions();
const tokens = await auth.passkey.loginVerify(response);
```

### Step 6 — Client-side flow

Use `@simplewebauthn/browser` to call the built-in routes:

**Register a new passkey** (authenticated user):

```ts
import { startRegistration } from '@simplewebauthn/browser';

const opts = await fetch('/api/auth/passkey/register/options').then(r => r.json());
const response = await startRegistration(opts);
await fetch('/api/auth/passkey/register/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(response),
});
```

**Login with passkey**:

```ts
import { startAuthentication } from '@simplewebauthn/browser';

const opts = await fetch('/api/auth/passkey/login/options').then(r => r.json());
const response = await startAuthentication(opts);
const result = await fetch('/api/auth/passkey/login/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(response),
}).then(r => r.json());
// result.accessToken, result.refreshToken
```

### Step 7 — Environment variables

Add to `.env.local`:

```
NEXT_PUBLIC_RP_ID=localhost
NEXT_PUBLIC_ORIGIN=http://localhost:3000
```

For production, change to your real domain and `https://` origin.

### Step 8 — Verify

- Register a passkey for a test user — `GET /api/auth/passkey/register/options` should return a challenge, `POST /api/auth/passkey/register/verify` should return `{ ok: true }`.
- Sign out and attempt login — `GET /api/auth/passkey/login/options`, `POST /api/auth/passkey/login/verify` should return tokens.
- Test on a device with biometric capability or use a browser passkey manager.
- Verify that the credential is stored in the passkeys table.

## Key references

- Plugin source: `packages/plugin-passkey/src/`
- Drizzle adapter: `packages/passkey-drizzle/src/`
- Core passkey utils: `packages/core/src/passkey/`
- Playground patterns: `apps/playground/app/`
