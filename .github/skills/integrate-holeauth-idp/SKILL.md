---
name: integrate-holeauth-idp
description: "Add an OAuth 2.0 / OpenID Connect Identity Provider (SSO) to a holeauth project using @holeauth/plugin-idp and @holeauth/idp-drizzle. Use when: adding SSO, adding OAuth provider, adding OpenID Connect, adding OIDC, adding IDP, acting as OAuth server, issuing access tokens to third-party apps, adding authorization server. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Database dialect: PostgreSQL / MySQL / SQLite"
---

# Integrate holeauth — Identity Provider (SSO / OAuth 2.0 / OIDC)

Covers `@holeauth/plugin-idp` and `@holeauth/idp-drizzle`.

> **Note**: This plugin turns your holeauth instance into an **OAuth 2.0 Authorization Server / OIDC Provider** — your app issues tokens to other apps. This is *not* for consuming external OAuth providers (e.g. "Login with Google"). For that, see the SSO guides in `guides/sso.mdx`.

> **Prerequisite**: Core setup must be complete (`integrate-holeauth-core`). If not done yet, load that skill first.

## Procedure

### Step 1 — Clarify requirements

Use `vscode/askQuestions` to ask:

1. **Database dialect** — Which database are you using?
   - Options: PostgreSQL, MySQL, SQLite

2. **Token signing algorithm** — Which algorithm should be used to sign access tokens?
   - Options: RS256 (recommended — asymmetric, public JWKS), HS256 (symmetric — simpler, no JWKS endpoint needed)

3. **Client types** — What kind of OAuth clients will you support?
   - Options (multi-select): Public clients (SPAs, mobile), Confidential clients (server-to-server), Both

4. **Scopes** — Which OIDC scopes do you need beyond the built-in ones (`openid`, `profile`, `email`)?
   - Free text — e.g. `read:posts write:posts` — or leave blank for defaults only.

5. **Consent screen** — Do users need to explicitly approve access for each app?
   - Options: Yes — show consent screen on first authorization, No — skip consent (trust all registered apps), Remember consent — show once, then remember per user×app×scope

6. **Team/app ownership** — Should registered OAuth apps belong to teams with developer/owner roles?
   - Options: Yes — multi-tenant app registry, No — single-owner apps only

### Step 2 — Install

```
@holeauth/plugin-idp
@holeauth/idp-drizzle
```

### Step 3 — Extend Drizzle schema

```ts title="db/schema.ts"
import { createIdpTables } from '@holeauth/idp-drizzle/pg'; // swap dialect

const idp = createIdpTables({ usersTable: users });

export const schema = {
  ...core.tables,
  ...idp.tables,
};
```

Run migrations after this change.

### Step 4 — Register the plugin

```ts title="lib/auth.ts"
import { idpPlugin } from '@holeauth/plugin-idp';
import { drizzleIdpAdapter } from '@holeauth/idp-drizzle/pg'; // swap dialect
import { db } from '@/db';

export const auth = defineHoleauth({
  // ...existing config
  plugins: [
    idpPlugin({
      adapter: drizzleIdpAdapter(db),
      signingAlg: 'RS256',
      issuer: process.env.NEXT_PUBLIC_APP_URL!, // e.g. https://myapp.com
      // consentPage: '/oauth/consent',  // custom consent page path
    }),
  ],
});
```

The plugin auto-registers these OAuth 2.0 / OIDC endpoints:
- `GET  /.well-known/openid-configuration` — OIDC discovery
- `GET  /.well-known/jwks.json` — public signing keys
- `GET  /oauth2/authorize` — authorization endpoint (redirects to consent)
- `POST /oauth2/token` — token endpoint (code exchange, refresh)
- `POST /oauth2/revoke` — token revocation (RFC 7009)
- `GET  /oauth2/userinfo` — userinfo endpoint
- `GET  /oauth2/end-session` — RP-initiated logout

### Step 5 — Register an OAuth app (server-side)

Before any client can use your IDP, register it via the plugin API:

```ts
const app = await auth.idp.registerApp({
  name: 'My Client App',
  type: 'confidential',        // or 'public'
  redirectUris: ['https://client.example.com/callback'],
  scopes: ['openid', 'profile', 'email'],
  ownerId: userId,             // user who owns this app
});

// Returns: { clientId, clientSecret? (confidential only) }
```

### Step 6 — API surface

```ts
// App registry
const apps = await auth.idp.listApps(userId);
await auth.idp.deleteApp(clientId);

// Token introspection
const claims = await auth.idp.introspectToken(accessToken);

// Key rotation (scheduled via cron)
await auth.idp.rotateSigningKey();

// Snapshot / reload
const snapshot = await auth.idp.snapshot();
```

### Step 7 — Consent page (Next.js)

If `consentPage` is configured, create a Next.js page at that path that:
1. Reads the pending authorization request from the query string.
2. Shows app name, requested scopes, and Allow / Deny buttons.
3. On Allow: `POST /oauth2/authorize` with `{ approved: true }`.
4. On Deny: redirect back with `error=access_denied`.

The plugin renders a built-in HTML consent page if `consentPage` is not set.

### Step 8 — Environment variables

```
NEXT_PUBLIC_APP_URL=https://myapp.com
```

For RS256, the plugin generates and stores signing keys automatically in the `idp_signing_keys` table. No manual key management is needed.

### Step 9 — Verify

- `GET /.well-known/openid-configuration` — should return a valid OIDC discovery document with your `issuer` URL.
- `GET /.well-known/jwks.json` — should return a JWKS with at least one RS256 key (if using RS256).
- Start an authorization code flow with a registered app — should redirect to the consent page.
- Exchange the code at `POST /oauth2/token` — should return `access_token`, `id_token`, `refresh_token`.
- Call `GET /oauth2/userinfo` with the access token — should return user claims.
- Revoke the refresh token via `POST /oauth2/revoke`.

## Key references

- Plugin source: `packages/plugin-idp/src/`
- Drizzle adapter: `packages/idp-drizzle/src/`
- Scopes + claims logic: `packages/plugin-idp/src/scopes.ts`
- PKCE verification: `packages/plugin-idp/src/pkce.ts`
- Playground SSO guide: `apps/docs/content/docs/guides/sso.mdx`
