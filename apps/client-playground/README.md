# client-playground

Standalone OIDC relying party for the `holeauth` plugin-idp. Runs on **port
3001** and treats the main `apps/playground` (port 3000) as an external IdP.

## Setup

1. **Bring the main playground up first** so its Postgres (port 54329) is
   reachable and the IdP signing key is bootstrapped:

   ```sh
   pnpm --filter playground dev           # or pnpm dev at the monorepo root
   pnpm --filter playground idp:init      # bootstrap signing key + seed `developer` group
   ```

2. **Sign into the main playground** with a developer-group account
   (`seed-user-reg@…` after running `idp:init`), go to
   `http://localhost:3000/developer/apps/new`, and create a **confidential**
   app with redirect URI `http://localhost:3001/oidc/callback`. Copy the
   shown `client_id` and `client_secret`.

3. **Configure this app**:

   ```sh
   cp apps/client-playground/.env.example apps/client-playground/.env.local
   # edit CLIENT_ID / CLIENT_SECRET
   ```

4. **Start this app** (spawns its own DB bootstrap + drizzle push):

   ```sh
   pnpm --filter client-playground dev
   ```

   or run both playgrounds in parallel from the monorepo root:

   ```sh
   pnpm dev
   ```

5. Open <http://localhost:3001>. Click **Sign in with Holeauth** → you get
   redirected to `localhost:3000/login?returnTo=…`, log in, approve consent,
   and land back here with an active session + decoded id_token / userinfo.

## What is stored here?

Completely separate from the main playground DB:

- `client_user` — one row per OIDC `sub`.
- `client_session` — opaque session id + upstream `access_token` /
  `refresh_token` / `id_token`. Tokens never leave the server.

## Endpoints

- `GET /` — dashboard.
- `GET|POST /login` — starts OIDC (state + nonce + PKCE S256).
- `GET /oidc/callback` — exchanges code → tokens.
- `POST /api/refresh` — rotates via `refresh_token` grant.
- `GET|POST /logout` — revokes refresh token upstream + RP-initiated logout.
