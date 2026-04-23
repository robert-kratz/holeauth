import { TOTP, Secret } from 'otpauth';

/** Generate a new base32 secret suitable for TOTP (160-bit). */
export function generateSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export interface TotpSetupResult {
  secret: string;
  /** otpauth:// URI for QR encoding. */
  otpauthUrl: string;
}

export function buildOtpauthUrl(input: {
  secret: string;
  label: string;
  issuer: string;
}): string {
  const t = new TOTP({
    issuer: input.issuer,
    label: input.label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(input.secret),
  });
  return t.toString();
}

/** Verify a 6-digit TOTP code against a base32 secret, allowing ±1 step drift. */
export function verifyTotp(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const t = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const delta = t.validate({ token: cleaned, window: 1 });
  return delta !== null;
}
