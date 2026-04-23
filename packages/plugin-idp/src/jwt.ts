/**
 * JWT signing/verification for the IdP.
 *
 * - Access tokens: JWT signed with the active IdP signing key, `aud=clientId`,
 *   `sub=userId`, `scope=<space-separated>`, configurable TTL.
 * - ID tokens: JWT signed with the active IdP signing key, `aud=clientId`,
 *   `sub=userId`, `nonce`, `auth_time`, claim set for granted scopes.
 * - Refresh tokens: NOT JWT — opaque random strings persisted as SHA-256
 *   hashes in the adapter (see `refresh.ts` caller). This module just
 *   provides the token generator + hasher for convenience.
 */
import { SignJWT, jwtVerify, createLocalJWKSet, type JWTPayload } from 'jose';
import type { KeyLike } from 'jose';
import type { IdpAdapter } from './adapter.js';
import { loadSigningMaterial } from './keys.js';
import type { IdpSigningKey } from './types.js';

export interface SignOptions {
  issuer: string;
  audience: string;
  subject: string;
  ttlSeconds: number;
  extra?: JWTPayload;
}

export async function signAccessToken(
  key: IdpSigningKey,
  opts: SignOptions & { scope: string },
): Promise<{ token: string; exp: number }> {
  const material = await loadSigningMaterial(key);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + opts.ttlSeconds;
  const token = await new SignJWT({
    ...opts.extra,
    scope: opts.scope,
    token_use: 'access',
  })
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: 'at+jwt' })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setSubject(opts.subject)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(material.privateKey as KeyLike);
  return { token, exp };
}

export async function signIdToken(
  key: IdpSigningKey,
  opts: SignOptions & {
    nonce: string | null;
    authTime: number;
    claims: Record<string, unknown>;
  },
): Promise<{ token: string; exp: number }> {
  const material = await loadSigningMaterial(key);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + opts.ttlSeconds;
  const payload: JWTPayload = { ...opts.extra, ...opts.claims, auth_time: opts.authTime };
  if (opts.nonce) payload.nonce = opts.nonce;
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: 'JWT' })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setSubject(opts.subject)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(material.privateKey as KeyLike);
  return { token, exp };
}

/**
 * Verify an IdP-issued access token against currently-active keys.
 * Used by `/userinfo`. Returns the payload on success, null on failure.
 */
export async function verifyAccessToken(
  adapter: IdpAdapter,
  token: string,
  opts: { issuer: string },
): Promise<JWTPayload | null> {
  try {
    const keys = await adapter.keys.listActive();
    if (keys.length === 0) return null;
    const jwks = createLocalJWKSet({ keys: keys.map((k) => k.publicJwk as unknown as Parameters<typeof createLocalJWKSet>[0]['keys'][number]) });
    const { payload } = await jwtVerify(token, jwks, { issuer: opts.issuer });
    return payload;
  } catch {
    return null;
  }
}

/* ───────────────────────── opaque token utilities ───────────────────────── */

function bufferToB64url(b: Uint8Array | ArrayBuffer): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Generate a random opaque token (refresh tokens, authorization codes). */
export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return bufferToB64url(b);
}

/** SHA-256 hex digest — used to store tokens without the raw value. */
export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
