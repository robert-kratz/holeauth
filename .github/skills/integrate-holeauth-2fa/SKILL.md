---
name: integrate-holeauth-2fa
description: "Add Two-Factor Authentication (TOTP / 2FA) to a holeauth project using @holeauth/plugin-2fa and @holeauth/2fa-drizzle. Use when: adding 2FA, adding TOTP, adding two-factor auth, adding OTP, setting up authenticator app support. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Database dialect: PostgreSQL / MySQL / SQLite"
---

# Integrate holeauth — Two-Factor Authentication (2FA)

Covers `@holeauth/plugin-2fa` and `@holeauth/2fa-drizzle`.

> **Prerequisite**: Core setup must be complete (`integrate-holeauth-core`). If not done yet, load that skill first.

## Procedure

### Step 1 — Clarify requirements

Use `vscode/askQuestions` to ask:

1. **Database dialect** — Which database are you using?
   - Options: PostgreSQL, MySQL, SQLite

2. **Recovery codes** — Should users be given one-time recovery codes when they enable 2FA?
   - Options: Yes (recommended), No

3. **Issuer name** — What name should appear in authenticator apps (e.g. Google Authenticator)?
   - Free text — defaults to the app name or domain.

4. **Enforce 2FA** — Should 2FA be required for all users, or opt-in?
   - Options: Opt-in (users choose), Required for all users, Required for specific roles only

5. **QR code rendering** — How do you want to show the setup QR code?
   - Options: Server-side PNG via `/2fa/render-qr` route (built-in), Client-side via `qrcode` library, Both

### Step 2 — Install

```
@holeauth/plugin-2fa
@holeauth/2fa-drizzle
```

### Step 3 — Extend Drizzle schema

Import `createTwoFactorTables` and merge into the schema:

```ts title="db/schema.ts"
import { createTwoFactorTables } from '@holeauth/2fa-drizzle/pg'; // swap dialect

const twoFa = createTwoFactorTables({ usersTable: users });

export const schema = {
  ...core.tables,
  ...twoFa.tables,
  // ... other plugins
};
```

Run migrations after this change.

### Step 4 — Register the plugin in the auth instance

```ts title="lib/auth.ts"
import { twoFactorPlugin } from '@holeauth/plugin-2fa';
import { drizzle2faAdapter } from '@holeauth/2fa-drizzle/pg'; // swap dialect
import { db } from '@/db';

export const auth = defineHoleauth({
  // ...existing config
  plugins: [
    twoFactorPlugin({
      adapter: drizzle2faAdapter(db),
      issuer: 'My App',          // shown in authenticator apps
      recoveryCodesCount: 10,    // set to 0 to disable
    }),
  ],
});
```

The plugin auto-registers:
- `POST /api/auth/2fa/verify` — verify TOTP code during sign-in challenge
- `GET  /api/auth/2fa/render-qr` — returns a PNG QR code for setup

### Step 5 — API surface (server-side)

Access the 2FA API via `auth.twofa` (or `auth.plugins['2fa']`):

```ts
// Setup flow (authenticated user)
const { secret, qrCodeUrl, recoveryCodes } = await auth.twofa.setup(userId);
await auth.twofa.activate(userId, totpCode);

// Disable (requires current TOTP code)
await auth.twofa.disable(userId, totpCode);

// Check status
const enabled = await auth.twofa.isEnabled(userId);
```

### Step 6 — Sign-in challenge flow

When 2FA is enabled, `auth.signIn()` returns `{ challengeToken }` instead of tokens. The client must then call `POST /api/auth/2fa/verify` with `{ challengeToken, code }`.

**Client-side example** (using `@holeauth/react`):

```tsx
const { signIn } = useSignIn();

const result = await signIn({ email, password });
if ('challengeToken' in result) {
  // redirect to /2fa-challenge with challengeToken
}
```

### Step 7 — Setup UI

Create a server action or API route that calls `auth.twofa.setup(userId)` and returns the `qrCodeUrl`. Render it in a client component. After the user scans and enters their first code, call `auth.twofa.activate(userId, code)`.

Show recovery codes exactly once after activation; hash and store them via the adapter automatically.

### Step 8 — Verify

- Enable 2FA for a test user: call `setup` → `activate`.
- Sign out and sign back in — should receive a `challengeToken` response.
- Call `POST /api/auth/2fa/verify` with a valid TOTP code — should return `{ accessToken, refreshToken }`.
- Call with a wrong code — should return a 401 error.
- Test a recovery code in place of a TOTP code.

## Key references

- Plugin source: `packages/plugin-2fa/src/`
- Drizzle adapter: `packages/2fa-drizzle/src/`
- Playground 2FA usage: `apps/playground/app/` (look for 2fa route and server actions)
