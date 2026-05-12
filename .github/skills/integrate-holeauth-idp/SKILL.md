---
name: integrate-holeauth-idp
description: "Run an OAuth 2.0 / OpenID Connect Identity Provider (SSO server) using @holeauth/plugin-idp and @holeauth/idp-drizzle. Use when: becoming an OIDC provider, issuing access tokens to other apps, running an authorization server, exposing /.well-known/openid-configuration, multi-tenant OAuth app registry. This is the SERVER side. To CONSUME an external IDP, use integrate-holeauth-idp-consumer. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Persistence: Drizzle (pg/mysql/sqlite) or headless IdpAdapter."
---

# Integrate holeauth — Identity Provider (Server / OIDC Issuer)

Covers `@holeauth/plugin-idp` (factory: `idp`) and `@holeauth/idp-drizzle` (`createIdpTables`, `createIdpAdapter`).

> Turns your holeauth instance into an **OAuth 2.0 / OIDC Authorization Server**. You issue tokens to third-party clients. To **consume** another IDP (your app logs users in via Google / another holeauth instance), see `integrate-holeauth-idp-consumer`.

> **Prerequisite**: `integrate-holeauth-core` already completed. Strongly recommended: pair with `integrate-holeauth-rbac` so app/team management permissions are gated.

## Procedure

### Step 1 — Plugin-specific questions

1. **Issuer URL** — `idpIssuer` — full URL, must equal what clients discover (e.g. `https://auth.example.com/api/auth`).
2. **Signing algorithm** — `idpAlg` — `RS256` *(recommended — JWKS published)* | `ES256` | `HS256`.
3. **Client types** — `idpClients` — multi-select: `Public (PKCE required)` / `Confidential (client_secret)` / `Both` *(default)*.
4. **PKCE policy** — `idpPkce` — `Required for public, optional for confidential` *(default)* | `Required for everyone (recommended for prod)`.
5. **Scopes supported** — `idpScopes` — multi-select + free text. Defaults: `openid`, `profile`, `email`, `offline_access`. Custom example: `read:posts write:posts`.
6. **Multi-tenant teams** — `idpTeams` — `Yes — apps belong to teams with owner/developer roles` *(default)* | `No — flat single-owner apps`.
7. **Consent screen** — `idpConsent` — `Built-in HTML page (default)` | `Custom Next.js page at /oauth/consent` | `Auto-approve trusted apps`.
8. **TTLs** — `idpTtls` — accept defaults or override:
   - access `900` | id `900` | refresh `2 592 000` | code `600` (seconds)
9. **Permission nodes** — `idpPerms` — RBAC nodes that gate API access (defaults shown):
   - create app: `idp.apps.create`
   - admin all apps: `idp.apps.admin`
10. **Token endpoint rate limit** — `idpRate` — `In-memory default (20/60s/key)` | `Custom` | `Disabled (NOT recommended)`.

### Step 2 — Install

```
@holeauth/plugin-idp
@holeauth/idp-drizzle      # if Drizzle
```

### Step 3 — Drizzle schema

```ts title="db/schema.ts"
import { createIdpTables } from '@holeauth/idp-drizzle/pg';

export const idpSchema = createIdpTables({ usersTable: users });

export const idpTeams                = idpSchema.tables.teams;
export const idpTeamMembers          = idpSchema.tables.teamMembers;
export const idpApps                 = idpSchema.tables.apps;
export const idpAuthorizationCodes   = idpSchema.tables.authorizationCodes;
export const idpRefreshTokens        = idpSchema.tables.refreshTokens;
export const idpConsents             = idpSchema.tables.consents;
export const idpSigningKeys          = idpSchema.tables.signingKeys;

export const schema = {
  ...core.tables,
  ...idpSchema.tables,
};
```

### Step 4 — Register the plugin (fully-filled)

```ts title="lib/auth.ts"
import { idp } from '@holeauth/plugin-idp';
import { createIdpAdapter } from '@holeauth/idp-drizzle/pg';
import { db } from '../db/client';
import { idpSchema } from '../db/schema';

const idpAdapter = createIdpAdapter({ db, tables: idpSchema.tables });

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export const auth = createAuthHandler({
  // ...existing config
  plugins: [
    idp({
      adapter: idpAdapter,
      issuer: `${APP_URL}/api/auth`,
      scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
      signingAlg: 'RS256',
      accessTokenTtl: 60 * 15,
      idTokenTtl: 60 * 15,
      refreshTokenTtl: 60 * 60 * 24 * 30,
      authorizationCodeTtl: 60 * 10,
      createAppPermission: 'idp.apps.create',
      adminAppPermission: 'idp.apps.admin',
      // tokenRateLimiter: createMemoryRateLimiter({ max: 20, windowMs: 60_000 }),
    }),
  ],
});
```

Auto-registered routes (under `<basePath>`):
- `GET  /.well-known/openid-configuration`
- `GET  /.well-known/jwks.json`
- `GET  /oauth2/authorize` *(redirects to consent)*
- `POST /oauth2/authorize` *(consent confirmation)*
- `POST /oauth2/token`
- `POST /oauth2/revoke` *(RFC 7009)*
- `GET  /oauth2/userinfo`
- `GET  /oauth2/end-session` *(RP-initiated logout)*

### Step 5 — Bootstrap signing keys (one-time, on cold start)

```ts
await auth.idp.keys.bootstrap(); // safe to call repeatedly — idempotent
```

Wire into `instrumentation.ts` (Next.js) or `scripts/idp-init.ts`.

### Step 6 — Register an OAuth app (server-side API)

```ts
const team = await auth.idp.teams.create(ownerUserId, 'My Team');
const { app, clientSecret } = await auth.idp.apps.create(ownerUserId, {
  name: 'My Client App',
  description: 'Production frontend',
  type: 'confidential', // or 'public'
  redirectUris: ['https://client.example.com/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  requirePkce: true,
  teamId: team.id,
});
// `clientSecret` is shown ONCE for confidential apps.
```

### Step 7 — Full API surface (`auth.idp`)

```ts
auth.idp.meta;                                    // { issuer, scopesSupported }

auth.idp.apps.create(callerUserId, input);
auth.idp.apps.listForUser(userId);
auth.idp.apps.listAll();                          // admin
auth.idp.apps.get(callerUserId, appId);
auth.idp.apps.update(callerUserId, appId, patch);
auth.idp.apps.regenerateSecret(callerUserId, appId);
auth.idp.apps.delete(callerUserId, appId);

auth.idp.teams.create(ownerUserId, name);
auth.idp.teams.listForUser(userId);
auth.idp.teams.listMembers(callerUserId, teamId);
auth.idp.teams.addMember(callerUserId, teamId, userId, 'developer' | 'owner');
auth.idp.teams.removeMember(callerUserId, teamId, userId);

auth.idp.tokens.listForApp(callerUserId, appId);
auth.idp.tokens.revokeAllForApp(callerUserId, appId);

auth.idp.keys.rotate();
auth.idp.keys.bootstrap();

auth.idp.adapter;                                 // escape hatch
```

### Step 8 — Custom consent page (optional)

If `consentPage` is in your roadmap, build `app/oauth/consent/page.tsx` reading the pending request from query string and rendering Allow/Deny → `POST /oauth2/authorize { approved: true }`. Otherwise the built-in HTML page renders automatically.

### Step 9 — Environment variables

```bash title=".env.local"
APP_URL=https://auth.example.com
# Optional: explicitly set issuer if it differs from APP_URL/api/auth
# IDP_ISSUER=https://auth.example.com
```

### Step 10 — Verify

- `GET /api/auth/.well-known/openid-configuration` returns the discovery doc with `issuer === <APP_URL>/api/auth`.
- `GET /api/auth/.well-known/jwks.json` returns at least one key.
- A registered app can complete the auth code + PKCE flow.
- `POST /oauth2/token` returns `{ access_token, id_token, refresh_token, token_type, expires_in }`.
- `GET /oauth2/userinfo` with the access token returns claims matching scopes.
- `POST /oauth2/revoke` invalidates a refresh token (family revoke on reuse).

## Headless variant

Implement `IdpAdapter` from `@holeauth/plugin-idp`. See the interface in `packages/plugin-idp/src/adapter.ts`.

## Key references

- `packages/plugin-idp/src/index.ts` — `IdpOptions`, `IdpApi`
- `packages/plugin-idp/src/types.ts` — `AppType`, `SigningAlg`, `IdpApp`, etc.
- `packages/idp-drizzle/src/{pg,mysql,sqlite}/index.ts`
- `apps/playground/scripts/idp-init.ts` — key bootstrap script
- `apps/playground/scripts/idp-simulate-client.ts` — end-to-end OAuth flow simulator
