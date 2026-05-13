---
name: integrate-holeauth-idp
description: "Run an OAuth 2.0 / OpenID Connect Identity Provider (SSO server) using @holeauth/plugin-idp and @holeauth/idp-drizzle. Use when: becoming an OIDC provider, issuing access tokens to other apps, running an authorization server, exposing /.well-known/openid-configuration, multi-tenant OAuth app registry, JWKS, refresh token rotation, signing key rotation. This is the SERVER side. To CONSUME an external IDP, use integrate-holeauth-idp-consumer. Requires integrate-holeauth-core."
argument-hint: "Inherits dialect + usersTable from core skill"
domain: "authentication, authorization, holeauth, sso, oidc, oauth, plugins, drizzle"
---

# Integrate holeauth — IDP Server (OIDC)

Turns the app into a full OAuth 2.0 / OpenID Connect authorization server. Issues JWT access tokens signed with rotating IdP-owned keys.

## Prerequisites

- `integrate-holeauth-core` complete
- Optionally `integrate-holeauth-rbac` (required if you want to gate `idp.apps.create` per group)

## Source of truth

- Reference plugin wiring: `apps/playground/lib/auth.ts` (line `idp({ adapter: idpPluginAdapter, issuer: ... })`)
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-idp`
- SSO provider guide: `https://docs.holeauth.dev/docs/sso/provider`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Default |
|---|---|---|---|
| 1 | `issuerUrl` | text | `${APP_URL}/api/auth` — must match exactly what RPs configure |
| 2 | `signingAlg` | radio | RS256 (recommended) · ES256 · HS256 (dev only) |
| 3 | `clientTypes` | multi-select | Public (PKCE) · Confidential (client_secret) · Both |
| 4 | `scopes` | multi-select | openid · profile · email · offline_access · custom |
| 5 | `consentScreen` | radio | Default · Custom (`app/oauth/consent/page.tsx`) |
| 6 | `accessTokenTtl` | number | 900 (15min) |
| 7 | `idTokenTtl` | number | 900 |
| 8 | `refreshTokenTtl` | number | 2592000 (30d) |
| 9 | `authorizationCodeTtl` | number | 600 (10min) |
| 10 | `multiTenant` | radio | Yes (use teams) · No (single team) |
| 11 | `createAppPermission` | text | `idp.apps.create` (only enforced if RBAC plugin present) |
| 12 | `adminAppPermission` | text | `idp.apps.admin` |

---

### Step 2 — Install

```bash
pnpm add @holeauth/plugin-idp @holeauth/idp-drizzle
```

---

### Step 3 — Schema

Edit `db/schema.ts`:

```ts
import { createIdpTables } from '@holeauth/idp-drizzle/<dialect>';

export const idpSchema = createIdpTables({ usersTable: users });

// Optional named re-exports for migrations/queries:
export const idpTeams = idpSchema.tables.teams;
export const idpTeamMembers = idpSchema.tables.teamMembers;
export const idpApps = idpSchema.tables.apps;
export const idpAuthorizationCodes = idpSchema.tables.authorizationCodes;
export const idpRefreshTokens = idpSchema.tables.refreshTokens;
export const idpConsents = idpSchema.tables.consents;
export const idpSigningKeys = idpSchema.tables.signingKeys;

export const schema = {
  ...core.tables,
  ...idpSchema.tables,
  ...core.relations,
};
```

Run `pnpm db:push`.

---

### Step 4 — Plugin registration

Edit `lib/auth.ts`:

```ts
import { idp } from '@holeauth/plugin-idp';
import { createIdpAdapter } from '@holeauth/idp-drizzle/<dialect>';
import { idpSchema } from '../db/schema';

const idpAdapter = createIdpAdapter({ db, tables: idpSchema.tables });

const plugins = [
  idp({
    adapter: idpAdapter,
    issuer: `${process.env.APP_URL}/api/auth`,
    scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
    signingAlg: 'RS256',
    accessTokenTtl: 900,
    idTokenTtl: 900,
    refreshTokenTtl: 2592000,
    authorizationCodeTtl: 600,
    createAppPermission: 'idp.apps.create',
    adminAppPermission: 'idp.apps.admin',
  }),
  // ...other plugins
] as const;
```

Auto-registered endpoints:

- `GET  /.well-known/openid-configuration` (always under the auth base path)
- `GET  /.well-known/jwks.json`
- `GET  <basePath>/oauth2/authorize`
- `POST <basePath>/oauth2/token`
- `POST <basePath>/oauth2/revoke`
- `GET  <basePath>/oauth2/userinfo`
- `GET  <basePath>/oauth2/end-session`

---

### Step 5 — Bootstrap signing keys at startup

Call `auth.idp.keys.bootstrap()` once at application startup. Without this, the first `/oauth2/authorize` request fails with `no_signing_keys`.

**This step is platform-specific** — the AI agent hooks into the startup mechanism appropriate for `framework`:
- **Next.js App Router:** use `instrumentation.ts` at the project root (guard with `process.env.NEXT_RUNTIME === 'nodejs'`; `instrumentationHook: true` required only on Next.js <15)
- **Express / Hono:** call `await auth.idp.keys.bootstrap()` in the server startup code, before the first request
- **Other:** call it in the equivalent application lifecycle hook

Docs: `https://docs.holeauth.dev/docs/packages/plugin-idp#key-bootstrap`

---

### Step 6 — Register the first OAuth app

```ts
// scripts/idp-init.ts
import { auth } from '../lib/auth';

const team = await auth.idp.teams.create({
  ownerUserId: process.env.OWNER_USER_ID!,
  name: 'My Org',
});

const app = await auth.idp.apps.create({
  teamId: team.id,
  name: 'My OAuth App',
  type: 'confidential', // or 'public'
  redirectUris: ['https://app.example.com/api/auth/callback/myidp'],
  scopes: ['openid', 'profile', 'email', 'offline_access'],
});

console.log('client_id:', app.clientId);
console.log('client_secret (shown once):', app.clientSecret);
```

---

### Step 7 — Full API surface

```ts
// Apps
auth.idp.apps.create({...}) / .listForUser(userId) / .listAll() / .get(id) / .update(id, patch)
// Teams
auth.idp.teams.create({...}) / .addMember({...}) / .list(userId)
// Tokens
auth.idp.tokens.revoke(token)
// Keys
auth.idp.keys.bootstrap()       // creates first signing key if none exist
auth.idp.keys.rotate()          // generates a new active key; old key remains for verify
// Adapter escape hatch (raw DB access):
auth.idp.adapter
```

---

### Step 8 — Custom consent screen (optional)

If `consentScreen === 'Custom'`, the AI agent creates a consent page appropriate for `framework`. The page must:
1. Read `userId` and `clientId` from the request context
2. Call `auth.idp.adapter.findConsent({ userId, clientId })` to check existing grants
3. Submit a form/request to `<basePath>/oauth2/authorize` with `consent=granted`

Docs: `https://docs.holeauth.dev/docs/sso/provider/consent`

---

## Hardcoded gotchas

1. **Access tokens are signed with IdP-owned RS256 keys**, NOT `secrets.jwtSecret`. The session JWT (`jwtSecret`) and the IdP JWT (signing keys table) are different cryptographic contexts.
2. **Refresh tokens are stored as SHA-256 hashes** with family-revoke on reuse — a leaked + replayed refresh token revokes the entire family.
3. **`issuer` must match exactly** what RPs configure. Trailing slash, port, scheme — all part of the identity. Changing it after apps are registered breaks discovery for those clients.
4. **`bootstrap()` MUST run at app startup** — failing to call it means the first `/oauth2/authorize` request fails with `no_signing_keys`.
5. **`createAppPermission` / `adminAppPermission` are only enforced if `plugin-rbac` is also registered.** Without RBAC, anyone with a valid session can create apps via `auth.idp.apps.create()` server-side (no HTTP endpoint).
6. **Default `tokenRateLimiter` is in-memory** (20 req/60s). Replace with a distributed limiter (or `false` to disable) in production.
7. **Key rotation** (`auth.idp.keys.rotate()`) marks the old key as `inactive` but keeps it for JWT verification until all tokens signed with it expire. Don't delete inactive keys before `refreshTokenTtl + accessTokenTtl` has passed.

---

## Verification checklist

```
[ ] DB migration applied after schema change: pnpm db:push
[ ] idp plugin appears in the plugins array with `as const`
[ ] Signing keys bootstrapped at startup (no errors on first request)
[ ] GET <basePath>/.well-known/openid-configuration returns valid JSON
[ ] GET <basePath>/.well-known/jwks.json returns at least one key
[ ] OAuth app created via auth.idp.apps.create() or seed script
[ ] Authorization code flow completes successfully with a test client
[ ] pnpm typecheck passes
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=idp+<topic>
```

Useful topics: `JWKS rotation`, `PKCE`, `authorization code`, `revocation`, `end session`, `multi-tenant teams`.
