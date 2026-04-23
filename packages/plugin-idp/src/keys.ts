/**
 * Signing key management for the IdP.
 *
 * Keys are generated with @node/jose and persisted as JWKs. Private JWKs
 * are stored in the adapter as-is; callers are responsible for encrypting
 * them at rest in production deployments. The JWKS endpoint only ever
 * exposes the public JWK.
 */
import { exportJWK, generateKeyPair, importJWK, type KeyLike } from 'jose';
import type { IdpAdapter } from './adapter.js';
import type { IdpSigningKey, SigningAlg } from './types.js';

export interface SigningKeyMaterial {
  kid: string;
  alg: SigningAlg;
  privateKey: KeyLike | Uint8Array;
  publicJwk: Record<string, unknown>;
}

/** Generate a new keypair and persist it to the adapter as the active key. */
export async function generateAndPersistKey(
  adapter: IdpAdapter,
  alg: SigningAlg = 'RS256',
): Promise<IdpSigningKey> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = (await exportJWK(publicKey)) as unknown as Record<string, unknown>;
  const privateJwk = (await exportJWK(privateKey)) as unknown as Record<string, unknown>;
  const kid = crypto.randomUUID();
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = alg;
  privateJwk.kid = kid;
  privateJwk.alg = alg;
  return adapter.keys.create({ kid, alg, publicJwk, privateJwk });
}

/** Ensure at least one signing key exists. Returns the active key. */
export async function ensureSigningKey(
  adapter: IdpAdapter,
  alg: SigningAlg = 'RS256',
): Promise<IdpSigningKey> {
  const existing = await adapter.keys.getActive();
  if (existing) return existing;
  return generateAndPersistKey(adapter, alg);
}

/** Rotate: mark current active rotated, then generate a new active key. */
export async function rotateSigningKey(
  adapter: IdpAdapter,
  alg: SigningAlg = 'RS256',
): Promise<IdpSigningKey> {
  const prev = await adapter.keys.getActive();
  if (prev) await adapter.keys.markRotated(prev.kid);
  return generateAndPersistKey(adapter, alg);
}

/** Load the private key material for signing. */
export async function loadSigningMaterial(
  key: IdpSigningKey,
): Promise<SigningKeyMaterial> {
  const privateKey = await importJWK(key.privateJwk as unknown as Parameters<typeof importJWK>[0], key.alg);
  return { kid: key.kid, alg: key.alg, privateKey, publicJwk: key.publicJwk };
}

/** Build a JWKS response body from currently-active keys. */
export async function buildJwks(
  adapter: IdpAdapter,
): Promise<{ keys: Record<string, unknown>[] }> {
  const keys = await adapter.keys.listActive();
  return { keys: keys.map((k) => k.publicJwk) };
}
