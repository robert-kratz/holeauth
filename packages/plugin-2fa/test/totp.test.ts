import { describe, it, expect } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { generateSecret, buildOtpauthUrl, verifyTotp } from '../src/totp.js';

describe('generateSecret', () => {
  it('produces a base32 string of length 32 (20 bytes)', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s).toHaveLength(32);
  });

  it('produces unique secrets on each call', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

describe('buildOtpauthUrl', () => {
  it('embeds issuer, label, and secret', () => {
    const secret = generateSecret();
    const url = buildOtpauthUrl({ secret, label: 'alice@example.com', issuer: 'Holeauth' });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('issuer=Holeauth');
    expect(decodeURIComponent(url)).toContain('alice@example.com');
    expect(url).toContain(`secret=${secret}`);
  });
});

describe('verifyTotp', () => {
  const secret = generateSecret();
  const liveCode = (): string =>
    new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) })
      .generate();

  it('accepts the current code', () => {
    expect(verifyTotp(secret, liveCode())).toBe(true);
  });

  it('tolerates whitespace', () => {
    const code = liveCode();
    expect(verifyTotp(secret, `  ${code[0]} ${code.slice(1)} `)).toBe(true);
  });

  it('rejects non-numeric input', () => {
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
  });

  it('rejects codes with wrong length', () => {
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, '1234567')).toBe(false);
  });

  it('rejects codes for a different secret', () => {
    const otherSecret = generateSecret();
    const code = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(otherSecret),
    }).generate();
    expect(verifyTotp(secret, code)).toBe(false);
  });

  it('rejects empty input', () => {
    expect(verifyTotp(secret, '')).toBe(false);
  });
});
