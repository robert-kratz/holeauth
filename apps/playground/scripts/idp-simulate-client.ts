#!/usr/bin/env tsx
/**
 * Minimal OAuth2 / OIDC client simulator for the playground IdP.
 *
 * Runs a tiny HTTP server on http://localhost:4000 that:
 *   1. On GET  /          → redirects you to the IdP /oauth2/authorize
 *                           with PKCE + state.
 *   2. On GET  /callback  → exchanges the `code` at /oauth2/token,
 *                           then calls /oauth2/userinfo and prints everything.
 *
 * Usage:
 *   1. Create an OAuth app in the playground under /developer/apps/new
 *      - Type: "public" (PKCE, no secret) — easiest for this demo.
 *        Or "confidential" and copy the client_secret once.
 *      - Redirect URI: http://localhost:4000/callback
 *      - Allowed scopes: openid profile email offline_access
 *   2. Export env vars:
 *        export IDP_ISSUER="http://localhost:3000/api/auth"
 *        export IDP_CLIENT_ID="<your client_id>"
 *        # only for confidential apps:
 *        export IDP_CLIENT_SECRET="<your secret>"
 *   3. Make sure you're logged in at http://localhost:3000 in your browser.
 *   4. Run: pnpm --filter playground idp:simulate
 *   5. Open http://localhost:4000 in the SAME browser.
 *      You will see the IdP authorize/consent screen, approve it, and the
 *      callback prints the tokens + userinfo.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const ISSUER = process.env.IDP_ISSUER ?? 'http://localhost:3000/api/auth';
const CLIENT_ID = process.env.IDP_CLIENT_ID;
const CLIENT_SECRET = process.env.IDP_CLIENT_SECRET; // optional
const PORT = Number(process.env.PORT ?? 4000);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = process.env.IDP_SCOPE ?? 'openid profile email offline_access';

if (!CLIENT_ID) {
  console.error('Missing IDP_CLIENT_ID env var. See header comment for setup.');
  process.exit(1);
}

/** In-memory store for the one active PKCE/state pair. */
let pending: { state: string; codeVerifier: string; nonce: string } | null = null;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkce() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    const state = base64url(crypto.randomBytes(16));
    const nonce = base64url(crypto.randomBytes(16));
    const { codeVerifier, codeChallenge } = makePkce();
    pending = { state, codeVerifier, nonce };

    const authorize = new URL(`${ISSUER}/oauth2/authorize`);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', CLIENT_ID);
    authorize.searchParams.set('redirect_uri', REDIRECT_URI);
    authorize.searchParams.set('scope', SCOPE);
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('nonce', nonce);
    authorize.searchParams.set('code_challenge', codeChallenge);
    authorize.searchParams.set('code_challenge_method', 'S256');

    res.writeHead(302, { location: authorize.toString() });
    res.end();
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end(`Authorization error: ${error} — ${url.searchParams.get('error_description') ?? ''}`);
      return;
    }
    if (!code || !state || !pending || pending.state !== state) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('Invalid state or missing code.');
      return;
    }

    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', REDIRECT_URI);
    form.set('client_id', CLIENT_ID);
    form.set('code_verifier', pending.codeVerifier);
    if (CLIENT_SECRET) form.set('client_secret', CLIENT_SECRET);

    const tokenRes = await fetch(`${ISSUER}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const tokens = await tokenRes.json();

    let userinfo: unknown = null;
    if (tokens?.access_token) {
      const uiRes = await fetch(`${ISSUER}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      userinfo = await uiRes.json().catch(() => null);
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:0 16px;">
      <h1>✓ Authorization complete</h1>
      <h2>Token response</h2>
      <pre style="background:#111;color:#0f0;padding:12px;border-radius:8px;overflow:auto;">${escape(
        JSON.stringify(tokens, null, 2),
      )}</pre>
      <h2>/userinfo</h2>
      <pre style="background:#111;color:#0f0;padding:12px;border-radius:8px;overflow:auto;">${escape(
        JSON.stringify(userinfo, null, 2),
      )}</pre>
      <p><a href="/">Start over</a></p>
    </body></html>`);
    pending = null;
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

server.listen(PORT, () => {
  console.log(`▶  OAuth client simulator running at http://localhost:${PORT}`);
  console.log(`   Issuer:       ${ISSUER}`);
  console.log(`   Client ID:    ${CLIENT_ID}`);
  console.log(`   Redirect URI: ${REDIRECT_URI}`);
  console.log(`   Scopes:       ${SCOPE}`);
  console.log(`\n   Open http://localhost:${PORT} in your browser to start.`);
});
