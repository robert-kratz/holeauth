---
name: integrate-holeauth-idp-consumer
description: "Consume an external OAuth 2.0 / OpenID Connect Identity Provider as a Relying Party (RP). Use when: signing users in via another holeauth IDP, signing users in via Google / GitHub / Auth0 / Keycloak / generic OIDC, building an SSO client, OIDC RP, OAuth client app, federated login, third-party login. The OPPOSITE of integrate-holeauth-idp (which IS the IDP)."
argument-hint: "Issuer URL of the upstream IDP, client_id, client_secret (if confidential), redirect URI."
---

# Integrate holeauth — IDP Consumer (Relying Party / SSO Client)

Sets your app up as an **OIDC Relying Party** that delegates authentication to an **external** authorization server. The local app holds its own session (cookie-based) but never owns passwords.

> Mirror reference: [apps/client-playground/lib/oidc.ts](apps/client-playground/lib/oidc.ts), [apps/client-playground/lib/session.ts](apps/client-playground/lib/session.ts).

> Two valid combinations:
> 1. **No local holeauth**: this skill alone — pure OIDC RP backed by your own session table.
> 2. **holeauth-core + this consumer**: use `@holeauth/core/sso` `GoogleProvider` / `GithubProvider` *(simpler — see `integrate-holeauth-core` Step 6)*. This skill is for **arbitrary** OIDC providers not in the built-in list.

## Procedure

### Step 1 — Consumer-specific questions

1. **Upstream IDP type** — `idpcType`
   - `Generic OIDC (uses /.well-known/openid-configuration discovery)` *(recommended)*
   - `Another holeauth instance running plugin-idp`
   - `OAuth 2.0 only (no OIDC discovery — manual endpoints)`
2. **Issuer URL** — `idpcIssuer` — free text (e.g. `https://auth.example.com/api/auth`).
3. **Client type** — `idpcClientType` — `Public (PKCE only)` | `Confidential (client_secret)` *(default)*.
4. **Client credentials** — `idpcClientId`, `idpcClientSecret` — free text (secret optional for public).
5. **Redirect URI** — `idpcRedirect` — `${APP_URL}/api/auth/callback` *(default)*.
6. **Scopes** — `idpcScopes` — free text (default `openid profile email offline_access`).
7. **Local session storage** — `idpcSession`
   - `Drizzle table (recommended — sessions persist across restarts)` *(default)*
   - `Stateless JWT (no DB row, opaque cookie holds tokens)`
8. **Token refresh strategy** — `idpcRefresh`
   - `Server-side on every request` *(default)*
   - `Client-side on 401`
   - `None (re-login when expired)`
9. **Logout behaviour** — `idpcLogout`
   - `RP-initiated end-session at upstream + clear local cookie` *(default)*
   - `Local cookie clear only`
10. **PKCE** — always recommended; **Required** for public clients.

### Step 2 — Install

```
jose                       # JWKS + JWT verify
drizzle-orm <driver>       # if storing sessions in DB
```

No `@holeauth/*` package is strictly required for the consumer side, but you may use `@holeauth/core/password` and `@holeauth/core/cookies` if mixing local accounts.

### Step 3 — Local session schema (if `idpcSession === Drizzle`)

```ts title="db/schema.ts"
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const clientUsers = pgTable('client_users', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  image: text('image'),
  upstreamSub: text('upstream_sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const clientSessions = pgTable('client_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true, mode: 'date' }),
});
```

### Step 4 — OIDC client helpers

Mirror [apps/client-playground/lib/oidc.ts](apps/client-playground/lib/oidc.ts). The full set you need:

- `getConfig()` — read `HOLEAUTH_ISSUER`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `SCOPES` from env.
- `discoverIssuer()` — fetch `<issuer>/.well-known/openid-configuration` (5 min cache).
- `getJwks()` — `createRemoteJWKSet(jwks_uri)`.
- `randomUrlSafe(bytes)` and `s256Challenge(verifier)` — PKCE helpers.
- `buildAuthorizeUrl({ state, nonce, codeChallenge })`.
- `exchangeCode({ code, codeVerifier })` → `TokenResponse`.
- `refresh(refreshToken)` → `TokenResponse`.
- `verifyIdToken(idToken, { nonce })` — uses JWKS + audience check.
- `fetchUserInfo(accessToken)`.
- `revokeToken(token, 'access_token' | 'refresh_token')`.
- `endSessionUrl({ idTokenHint, postLogoutRedirectUri })`.

Generate this file verbatim from the playground reference, parameterised on the answers from Step 1.

### Step 5 — Routes (Next.js App Router)

Three routes are required:

```ts title="app/login/route.ts"
import { cookies } from 'next/headers';
import { buildAuthorizeUrl, randomUrlSafe, s256Challenge } from '@/lib/oidc';

export async function GET() {
  const state = randomUrlSafe();
  const nonce = randomUrlSafe();
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = s256Challenge(codeVerifier);

  const store = await cookies();
  store.set('oidc.state', state,        { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  store.set('oidc.nonce', nonce,        { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  store.set('oidc.verifier', codeVerifier, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });

  const url = await buildAuthorizeUrl({ state, nonce, codeChallenge });
  return Response.redirect(url);
}
```

```ts title="app/api/auth/callback/route.ts"
import { cookies } from 'next/headers';
import { exchangeCode, fetchUserInfo, verifyIdToken } from '@/lib/oidc';
import { upsertUser, createSession, setSessionCookie } from '@/lib/session';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const store = await cookies();
  if (!code || state !== store.get('oidc.state')?.value) {
    return new Response('state mismatch', { status: 400 });
  }
  const verifier = store.get('oidc.verifier')!.value;
  const nonce = store.get('oidc.nonce')!.value;

  const tokens = await exchangeCode({ code, codeVerifier: verifier });
  if (tokens.id_token) await verifyIdToken(tokens.id_token, { nonce });
  const profile = await fetchUserInfo(tokens.access_token);

  const user = await upsertUser(profile);
  const sid = await createSession({
    userId: user.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresInSec: tokens.expires_in,
  });
  await setSessionCookie(sid);
  return Response.redirect(new URL('/', req.url));
}
```

```ts title="app/logout/route.ts"
import { getCurrentSession, clearSessionCookie, deleteSession } from '@/lib/session';
import { endSessionUrl, revokeToken } from '@/lib/oidc';

export async function GET(req: Request) {
  const sess = await getCurrentSession();
  if (sess) {
    if (sess.refreshToken) await revokeToken(sess.refreshToken, 'refresh_token').catch(() => {});
    await deleteSession(sess.id);
  }
  await clearSessionCookie();

  const url = await endSessionUrl({
    idTokenHint: sess?.idToken ?? undefined,
    postLogoutRedirectUri: new URL('/', req.url).toString(),
  });
  return Response.redirect(url ?? new URL('/', req.url));
}
```

### Step 6 — Local session helpers

Mirror [apps/client-playground/lib/session.ts](apps/client-playground/lib/session.ts):

- `createSession({ userId, accessToken, refreshToken?, idToken?, expiresInSec, refreshExpiresInSec? })`.
- `setSessionCookie(id)` — `httpOnly`, `secure` in prod, `sameSite: 'lax'`.
- `getCurrentSession()` — read cookie, look up DB row + user; auto-refresh if access expired and refresh present.
- `deleteSession(id)`, `clearSessionCookie()`.
- `upsertUser(profile)` — insert by `upstream_sub`, update name/email/image.

### Step 7 — Environment

```bash title=".env.local"
HOLEAUTH_ISSUER=https://auth.example.com/api/auth   # upstream IDP
CLIENT_ID=...
CLIENT_SECRET=...                                   # omit for public clients
REDIRECT_URI=http://localhost:3000/api/auth/callback
SCOPES="openid profile email offline_access"
APP_URL=http://localhost:3000
```

### Step 8 — Token refresh middleware (optional)

If `idpcRefresh === 'server-side'`, add a wrapper that, on every server-side render, checks `accessExpiresAt`; if expired and `refreshToken` present, calls `refresh()` and rotates the DB row.

### Step 9 — Verify

- `/login` redirects to upstream `/oauth2/authorize` with PKCE.
- After consent, the callback exchanges the code, verifies `id_token` (issuer + audience + nonce), fetches userinfo, and creates a local session.
- `/logout` revokes the refresh token, clears the cookie, and (if supported) hits upstream `end_session_endpoint`.
- `getCurrentSession()` transparently refreshes when the access token nears expiry.

## Combining with `@holeauth/core` (hybrid)

Pair this skill with `integrate-holeauth-core` if you want **both** local password accounts AND federated login. The federated path uses this skill's routes; the local path uses the holeauth flows. Map upstream identities into the local users table via `upstreamSub` so the same user_id is referenced everywhere.

## Key references

- [apps/client-playground/lib/oidc.ts](apps/client-playground/lib/oidc.ts) — full RP helper module
- [apps/client-playground/lib/session.ts](apps/client-playground/lib/session.ts) — local session table
- [apps/client-playground/db/schema.ts](apps/client-playground/db/schema.ts) — schema reference
- For built-in Google / GitHub providers consumed *inside* a holeauth instance: see `@holeauth/core/sso` and the `providers` field in `integrate-holeauth-core` Step 6.
