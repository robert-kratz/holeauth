/**
 * Tests for PKCE helpers.
 */
import { describe, it, expect } from 'vitest';
import { s256Challenge, verifyPkce, randomVerifier } from '../src/pkce.js';

describe('s256Challenge', () => {
  it('returns the RFC 7636 example digest', async () => {
    // From RFC 7636 Appendix B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await s256Challenge(verifier)).toBe(expected);
  });
});

describe('verifyPkce', () => {
  it('verifies a matching S256 verifier/challenge', async () => {
    const verifier = randomVerifier(48);
    const challenge = await s256Challenge(verifier);
    expect(await verifyPkce({ verifier, challenge, method: 'S256' })).toBe(true);
  });

  it('rejects a mismatched S256 verifier', async () => {
    const challenge = await s256Challenge('one');
    expect(await verifyPkce({ verifier: 'two', challenge, method: 'S256' })).toBe(false);
  });

  it('verifies plain method by exact equality', async () => {
    expect(await verifyPkce({ verifier: 'abc', challenge: 'abc', method: 'plain' })).toBe(true);
    expect(await verifyPkce({ verifier: 'abc', challenge: 'xyz', method: 'plain' })).toBe(false);
  });
});

describe('randomVerifier', () => {
  it('returns a base64url string of roughly the requested entropy', () => {
    const v = randomVerifier(32);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → 43 chars base64url (no padding)
    expect(v.length).toBeGreaterThanOrEqual(40);
  });

  it('produces different values on successive calls', () => {
    expect(randomVerifier()).not.toEqual(randomVerifier());
  });

  it('respects a custom length', () => {
    const v = randomVerifier(16);
    expect(v.length).toBeGreaterThanOrEqual(20);
    expect(v.length).toBeLessThanOrEqual(24);
  });
});
