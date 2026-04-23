import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { createHash, randomBytes } from 'node:crypto';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
}

export interface DiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** Must be called fresh per request to read env lazily. */
export function getConfig(): OidcConfig {
  const issuer = process.env.HOLEAUTH_ISSUER;
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const scopes = process.env.SCOPES ?? 'openid profile email';
  if (!issuer || !clientId || !redirectUri) {
    throw new Error(
      '[client-playground] HOLEAUTH_ISSUER, CLIENT_ID, REDIRECT_URI must be set in .env.local',
    );
  }
  return { issuer, clientId, clientSecret: process.env.CLIENT_SECRET, redirectUri, scopes };
}

let discoveryCache: { at: number; doc: DiscoveryDoc } | null = null;
const DISCOVERY_TTL_MS = 5 * 60_000;

export async function discoverIssuer(issuer?: string): Promise<DiscoveryDoc> {
  const iss = issuer ?? getConfig().issuer;
  const now = Date.now();
  if (discoveryCache && now - discoveryCache.at < DISCOVERY_TTL_MS) return discoveryCache.doc;
  const url = `${iss}/.well-known/openid-configuration`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`discover: ${res.status} ${res.statusText}`);
  const doc = (await res.json()) as DiscoveryDoc;
  discoveryCache = { at: now, doc };
  return doc;
}

let jwksCache: { iss: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

async function getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const doc = await discoverIssuer();
  if (!jwksCache || jwksCache.iss !== doc.issuer) {
    jwksCache = { iss: doc.issuer, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) };
  }
  return jwksCache.jwks;
}

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function s256Challenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function buildAuthorizeUrl(args: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): Promise<string> {
  const cfg = getConfig();
  const doc = await discoverIssuer();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state: args.state,
    nonce: args.nonce,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${doc.authorization_endpoint}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function exchangeCode(args: {
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const cfg = getConfig();
  const doc = await discoverIssuer();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: cfg.redirectUri,
    code_verifier: args.codeVerifier,
    client_id: cfg.clientId,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (cfg.clientSecret) headers.authorization = basicAuthHeader(cfg.clientId, cfg.clientSecret);
  const res = await fetch(doc.token_endpoint, { method: 'POST', headers, body });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`token: ${json.error ?? res.status} ${json.error_description ?? ''}`);
  return json;
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const cfg = getConfig();
  const doc = await discoverIssuer();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.clientId,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (cfg.clientSecret) headers.authorization = basicAuthHeader(cfg.clientId, cfg.clientSecret);
  const res = await fetch(doc.token_endpoint, { method: 'POST', headers, body });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`refresh: ${json.error ?? res.status} ${json.error_description ?? ''}`);
  return json;
}

export async function verifyIdToken(
  idToken: string,
  expect: { nonce: string },
): Promise<JWTPayload> {
  const cfg = getConfig();
  const jwks = await getJwks();
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: (await discoverIssuer()).issuer,
    audience: cfg.clientId,
  });
  if (payload.nonce !== expect.nonce) throw new Error('id_token nonce mismatch');
  return payload;
}

export async function fetchUserInfo(accessToken: string): Promise<Record<string, unknown>> {
  const doc = await discoverIssuer();
  if (!doc.userinfo_endpoint) throw new Error('no userinfo endpoint');
  const res = await fetch(doc.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function revokeToken(token: string, kind: 'access_token' | 'refresh_token'): Promise<void> {
  const cfg = getConfig();
  const doc = await discoverIssuer();
  if (!doc.revocation_endpoint) return;
  const body = new URLSearchParams({ token, token_type_hint: kind, client_id: cfg.clientId });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cfg.clientSecret) headers.authorization = basicAuthHeader(cfg.clientId, cfg.clientSecret);
  await fetch(doc.revocation_endpoint, { method: 'POST', headers, body });
}

export async function endSessionUrl(args: {
  idTokenHint?: string;
  postLogoutRedirectUri?: string;
}): Promise<string | null> {
  const doc = await discoverIssuer();
  if (!doc.end_session_endpoint) return null;
  const params = new URLSearchParams();
  if (args.idTokenHint) params.set('id_token_hint', args.idTokenHint);
  if (args.postLogoutRedirectUri) params.set('post_logout_redirect_uri', args.postLogoutRedirectUri);
  return `${doc.end_session_endpoint}?${params.toString()}`;
}
