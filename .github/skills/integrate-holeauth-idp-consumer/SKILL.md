---
name: integrate-holeauth-idp-consumer
description: "Consume an external OAuth 2.0 / OpenID Connect Identity Provider as a Relying Party (RP). Use when: signing users in via another holeauth IDP, signing users in via Auth0 / Keycloak / Okta / generic OIDC, building an SSO client, OIDC RP, OAuth client app, federated login, third-party login. The OPPOSITE of integrate-holeauth-idp (which IS the IDP). Note: Google and GitHub are built into @holeauth/core/sso — use that instead for those two."
argument-hint: "Optional: upstream issuer URL"
---

# Integrate holeauth — IDP Consumer (OIDC Relying Party)

Sign users in via an external OIDC provider (another holeauth IdP, Auth0, Keycloak, Okta, generic OIDC, etc.) and maintain a local session.

**For Google / GitHub:** use `GoogleProvider` / `GithubProvider` from `@holeauth/core/sso` instead — covered by `integrate-holeauth-core`.

## Prerequisites

- A Drizzle DB or another store for local user/session rows
- Upstream OIDC provider with a registered client (client_id, client_secret if confidential, redirect URI)

## Source of truth

- Reference: `apps/client-playground/lib/oidc.ts` and `apps/client-playground/lib/session.ts` in the holeauth repo
- Docs: `https://docs.holeauth.dev/docs/sso/consumer`, `https://docs.holeauth.dev/docs/sso/consumer/generic-oidc`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Notes |
|---|---|---|---|
| 1 | `upstreamType` | radio | Generic OIDC · Another holeauth IdP · OAuth 2.0 only (no OIDC userinfo) |
| 2 | `issuerUrl` | text | Used for discovery at `<issuer>/.well-known/openid-configuration` |
| 3 | `clientType` | radio | Public (PKCE) · Confidential (client_secret) |
| 4 | `clientId` / `clientSecret` | text | If confidential, secret is required |
| 5 | `redirectUri` | text | e.g. `${APP_URL}/api/auth/callback` |
| 6 | `scopes` | multi-select | openid · profile · email · offline_access · custom |
| 7 | `sessionStrategy` | radio | Drizzle (server) · JWT cookie (stateless) |
| 8 | `refreshStrategy` | radio | On every SSR · On 401 only · Manual |
| 9 | `logoutBehavior` | radio | Local only · RP-initiated end-session |
| 10 | `pkce` | radio | Yes (recommended; required for public clients) · No |

---

### Step 2 — Install

```bash
pnpm add jose drizzle-orm
# dialect driver (pg / mysql / sqlite)
pnpm add pg
pnpm add -D drizzle-kit @types/pg
```

No `@holeauth/*` package is strictly required for this skill. Optionally, you can layer `@holeauth/core` on top later for primitives like password hashing — but it is NOT used for the OIDC flow itself.

---

### Step 3 — Local session schema

`db/schema.ts`:

```ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const clientUsers = pgTable('client_users', {
  id: text('id').primaryKey(),                          // upstream `sub`
  email: text('email').notNull(),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clientSessions = pgTable('client_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => clientUsers.id),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

### Step 4 — OIDC client helpers (`lib/oidc.ts`)

Implement these functions — see reference `apps/client-playground/lib/oidc.ts`:

| Function | Purpose |
|---|---|
| `getConfig()` | Reads env vars into a typed config |
| `discoverIssuer()` | Fetches `.well-known/openid-configuration`, **cache 5 min** |
| `getJwks()` | Fetches `jwks_uri`, **cache 5 min** |
| `randomUrlSafe(bytes)` | Crypto-safe random for state/nonce/verifier |
| `s256Challenge(verifier)` | SHA-256 base64url for PKCE |
| `buildAuthorizeUrl({state, nonce, verifier})` | Constructs the redirect URL |
| `exchangeCode({code, verifier})` | POSTs to `token_endpoint`, returns tokens |
| `refresh(refreshToken)` | Token refresh |
| `verifyIdToken(idToken, {nonce, audience})` | Verifies signature + claims using `jose` |
| `fetchUserInfo(accessToken)` | Calls `userinfo_endpoint` |
| `revokeToken(token)` | RFC 7009 revocation (if supported by upstream) |
| `endSessionUrl(idToken, postLogoutUri)` | RP-initiated logout URL |

Fetch the reference implementation via `fetch_webpage('https://docs.holeauth.dev/docs/sso/consumer/generic-oidc')` if needed.

---

### Step 5 — Routes

**`app/login/route.ts`:**

```ts
// Generate state, nonce, PKCE verifier → set as cookies → redirect to authorize URL
```

**`app/api/auth/callback/route.ts`:**

```ts
// Read state cookie + query — must match
// exchangeCode(code, verifier) → verifyIdToken → upsertUser → createSession → setSessionCookie → redirect home
```

**`app/logout/route.ts`:**

```ts
// revokeToken(refreshToken) (best effort) → deleteSession → clearSessionCookie
// if logoutBehavior === 'RP-initiated': redirect to endSessionUrl(idToken, postLogoutUri)
```

---

### Step 6 — Session helpers (`lib/session.ts`)

Reference: `apps/client-playground/lib/session.ts`. Required functions:

- `createSession({userId, tokens})` — persists row, returns sessionId
- `setSessionCookie(sessionId)` — httpOnly cookie
- `getCurrentSession()` — reads cookie, returns session **auto-refreshing** if `accessExpiresAt < now + 60s`
- `deleteSession(sessionId)`
- `clearSessionCookie()`
- `upsertUser(claims)` — idempotent insert/update by `sub`

---

### Step 7 — Environment

```
HOLEAUTH_ISSUER=https://idp.example.com/api/auth
HOLEAUTH_CLIENT_ID=...
HOLEAUTH_CLIENT_SECRET=...   # only if confidential
HOLEAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback
HOLEAUTH_SCOPES=openid profile email offline_access
APP_URL=http://localhost:3000
SESSION_SECRET=<openssl rand -base64 32>
```

---

### Step 8 — Refresh middleware (if `refreshStrategy === 'On every SSR'`)

Add to `middleware.ts` (or `proxy.ts` on Next.js 16+):

```ts
// On each request: read session cookie → if accessExpiresAt < now + 60s → refresh + Set-Cookie
```

---

## Hardcoded gotchas

1. **Cache discovery and JWKS** — without caching, every request hits the upstream provider. 5 minute TTL is a reasonable default; longer if the upstream rotates infrequently.
2. **PKCE verifier must NOT leave the server.** Store it in an httpOnly cookie keyed by state, then delete it after the token exchange.
3. **Verify `nonce` from the `id_token` against the one you generated** — this is what prevents replay. `jose`'s `jwtVerify` does NOT check `nonce`; you must.
4. **`sub` is the stable user identifier.** Email can change upstream; do NOT key your local user table on email.
5. **`offline_access` scope** is required to receive a refresh token from most providers (including holeauth IdPs).
6. **RP-initiated logout requires `id_token_hint`** — store the `id_token` server-side at login if you want true single-logout. Otherwise the user remains signed in upstream.
7. **State cookie MUST be `sameSite: 'lax'`** (not `strict`) — `strict` blocks the cookie on the cross-site redirect back from the IdP.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=oidc+consumer+<topic>
```

Useful topics: `discovery`, `PKCE`, `id_token verification`, `refresh rotation`, `end-session`, `account-linking`.
