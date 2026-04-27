/**
 * Tests for key management + JWT signing/verification.
 * Uses a minimal in-memory IdpAdapter (only the `keys` subtree is exercised).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { jwtVerify, createLocalJWKSet } from 'jose';
import type { IdpAdapter } from '../src/adapter.js';
import type { IdpSigningKey, SigningAlg } from '../src/types.js';
import {
  ensureSigningKey,
  generateAndPersistKey,
  rotateSigningKey,
  loadSigningMaterial,
  buildJwks,
} from '../src/keys.js';
import {
  signAccessToken,
  signIdToken,
  verifyAccessToken,
  randomToken,
  sha256Hex,
} from '../src/jwt.js';

/* in-memory keys adapter (only keys matter for these tests) */
function makeKeysAdapter(): IdpAdapter {
  const store = new Map<string, IdpSigningKey>();
  return {
    teams: {} as unknown as IdpAdapter['teams'],
    apps: {} as unknown as IdpAdapter['apps'],
    codes: {} as unknown as IdpAdapter['codes'],
    refresh: {} as unknown as IdpAdapter['refresh'],
    consent: {} as unknown as IdpAdapter['consent'],
    keys: {
      async listActive() {
        return [...store.values()].filter((k) => k.active);
      },
      async getActive() {
        return [...store.values()].find((k) => k.active) ?? null;
      },
      async create(input) {
        const k: IdpSigningKey = {
          kid: input.kid,
          alg: input.alg,
          publicJwk: input.publicJwk,
          privateJwk: input.privateJwk,
          active: true,
          createdAt: new Date(),
          rotatedAt: null,
        };
        store.set(k.kid, k);
        return k;
      },
      async markRotated(kid) {
        const k = store.get(kid);
        if (k) {
          k.active = false;
          k.rotatedAt = new Date();
        }
      },
    },
  };
}

describe('ensureSigningKey', () => {
  let adapter: IdpAdapter;
  beforeEach(() => {
    adapter = makeKeysAdapter();
  });

  it('creates an RS256 key the first time and returns the same key on subsequent calls', async () => {
    const k1 = await ensureSigningKey(adapter);
    const k2 = await ensureSigningKey(adapter);
    expect(k1.kid).toBe(k2.kid);
    expect(k1.alg).toBe('RS256');
    expect(k1.active).toBe(true);
  });

  it('accepts a non-default algorithm', async () => {
    const k = await ensureSigningKey(adapter, 'EdDSA' as SigningAlg);
    expect(k.alg).toBe('EdDSA');
  });
});

describe('rotateSigningKey', () => {
  it('marks the previous key rotated and mints a new active one', async () => {
    const adapter = makeKeysAdapter();
    const first = await ensureSigningKey(adapter);
    const second = await rotateSigningKey(adapter);
    expect(second.kid).not.toBe(first.kid);
    expect((await adapter.keys.getActive())?.kid).toBe(second.kid);
  });

  it('is safe when no key exists yet', async () => {
    const adapter = makeKeysAdapter();
    const k = await rotateSigningKey(adapter);
    expect(k.active).toBe(true);
  });
});

describe('generateAndPersistKey', () => {
  it('stamps kid/use/alg onto the public JWK', async () => {
    const adapter = makeKeysAdapter();
    const k = await generateAndPersistKey(adapter, 'RS256');
    expect(k.publicJwk.kid).toBe(k.kid);
    expect(k.publicJwk.use).toBe('sig');
    expect(k.publicJwk.alg).toBe('RS256');
  });
});

describe('buildJwks', () => {
  it('exposes only public JWKs of active keys', async () => {
    const adapter = makeKeysAdapter();
    await ensureSigningKey(adapter);
    const jwks = await buildJwks(adapter);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).not.toHaveProperty('d'); // no private material
  });
});

describe('loadSigningMaterial', () => {
  it('imports the private JWK into a usable KeyLike', async () => {
    const adapter = makeKeysAdapter();
    const key = await ensureSigningKey(adapter);
    const mat = await loadSigningMaterial(key);
    expect(mat.kid).toBe(key.kid);
    expect(mat.privateKey).toBeDefined();
  });
});

describe('signAccessToken / verifyAccessToken', () => {
  it('signs and verifies an access token round-trip', async () => {
    const adapter = makeKeysAdapter();
    const key = await ensureSigningKey(adapter);
    const { token, exp } = await signAccessToken(key, {
      issuer: 'https://idp.example',
      audience: 'client-1',
      subject: 'user-1',
      scope: 'openid profile',
      ttlSeconds: 60,
      extra: { client_id: 'client-1' },
    });
    expect(token).toBeTruthy();
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const payload = await verifyAccessToken(adapter, token, { issuer: 'https://idp.example' });
    expect(payload?.sub).toBe('user-1');
    expect(payload?.scope).toBe('openid profile');
    expect(payload?.client_id).toBe('client-1');
  });

  it('verifyAccessToken returns null for a tampered/bad token', async () => {
    const adapter = makeKeysAdapter();
    await ensureSigningKey(adapter);
    expect(
      await verifyAccessToken(adapter, 'not.a.jwt', { issuer: 'https://idp.example' }),
    ).toBeNull();
  });

  it('verifyAccessToken returns null when no active keys exist', async () => {
    const adapter = makeKeysAdapter();
    expect(
      await verifyAccessToken(adapter, 'eyJhbGciOiJSUzI1NiJ9.x.y', {
        issuer: 'https://idp.example',
      }),
    ).toBeNull();
  });

  it('verifyAccessToken rejects an issuer mismatch', async () => {
    const adapter = makeKeysAdapter();
    const key = await ensureSigningKey(adapter);
    const { token } = await signAccessToken(key, {
      issuer: 'https://idp.example',
      audience: 'client-1',
      subject: 'user-1',
      scope: 'openid',
      ttlSeconds: 60,
    });
    expect(
      await verifyAccessToken(adapter, token, { issuer: 'https://other' }),
    ).toBeNull();
  });
});

describe('signIdToken', () => {
  it('embeds nonce, auth_time and claims', async () => {
    const adapter = makeKeysAdapter();
    const key = await ensureSigningKey(adapter);
    const { token } = await signIdToken(key, {
      issuer: 'https://idp.example',
      audience: 'client-1',
      subject: 'user-1',
      ttlSeconds: 60,
      nonce: 'n-1',
      authTime: 1_700_000_000,
      claims: { email: 'a@example.com' },
    });
    const jwks = createLocalJWKSet({
      keys: [key.publicJwk as Parameters<typeof createLocalJWKSet>[0]['keys'][number]],
    });
    const { payload } = await jwtVerify(token, jwks, { issuer: 'https://idp.example' });
    expect(payload.nonce).toBe('n-1');
    expect(payload.auth_time).toBe(1_700_000_000);
    expect(payload.email).toBe('a@example.com');
  });

  it('omits nonce when null', async () => {
    const adapter = makeKeysAdapter();
    const key = await ensureSigningKey(adapter);
    const { token } = await signIdToken(key, {
      issuer: 'https://idp.example',
      audience: 'c',
      subject: 'u',
      ttlSeconds: 60,
      nonce: null,
      authTime: 1,
      claims: {},
    });
    const jwks = createLocalJWKSet({
      keys: [key.publicJwk as Parameters<typeof createLocalJWKSet>[0]['keys'][number]],
    });
    const { payload } = await jwtVerify(token, jwks);
    expect('nonce' in payload).toBe(false);
  });
});

describe('opaque token utilities', () => {
  it('randomToken produces base64url strings of varying content', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toEqual(b);
  });

  it('sha256Hex produces a stable 64-char hex digest', async () => {
    const h1 = await sha256Hex('hello');
    const h2 = await sha256Hex('hello');
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
