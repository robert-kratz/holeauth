/**
 * Generic OAuth2/OIDC PKCE client helpers.
 * High-level per-provider flows live in ./authorize.ts and ./callback.ts.
 */
import { ProviderError } from '../errors/index.js';

export interface AuthorizeParams {
  issuerAuthUrl: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state: string;
  codeChallenge: string;
  nonce?: string;
  /** Extra params merged into the query string. */
  extra?: Record<string, string>;
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const url = new URL(p.issuerAuthUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('scope', (p.scopes ?? ['openid', 'email', 'profile']).join(' '));
  url.searchParams.set('state', p.state);
  url.searchParams.set('code_challenge', p.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (p.nonce) url.searchParams.set('nonce', p.nonce);
  for (const [k, v] of Object.entries(p.extra ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(bytes);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(hash)) };
}

export function generateState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

export function generateNonce(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

export interface TokenExchangeInput {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export async function exchangeCode(i: TokenExchangeInput): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: i.code,
    redirect_uri: i.redirectUri,
    client_id: i.clientId,
    client_secret: i.clientSecret,
    code_verifier: i.codeVerifier,
  });
  const res = await fetch(i.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new ProviderError(`Token exchange failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchUserInfo(
  userinfoUrl: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new ProviderError(`Userinfo failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export function base64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
