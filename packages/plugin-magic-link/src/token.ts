/**
 * Edge-safe token + OTP generation. Web Crypto only — no Node `crypto`,
 * so this module is importable from Edge runtimes / middleware.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(bytes: Uint8Array): string {
  // Edge runtimes have `btoa`; map to base64url.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Cryptographically random URL-safe token. 32 bytes ≈ 256 bits entropy. */
export function generateMagicToken(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  // Use ALPHABET to keep the token short, URL-safe, and easy to copy.
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += ALPHABET[buf[i]! & 63];
  }
  return out;
}

/**
 * Numeric OTP, drawn uniformly. Length defaults to 6 (10^6 = ~20 bits).
 * Combined with rate-limiting + short TTL, that is enough for email OTPs.
 */
export function generateOtp(length = 6): string {
  if (length < 4 || length > 10) {
    throw new Error('OTP length must be between 4 and 10 digits');
  }
  // Rejection-sample uniformly so leading-zero / digit-bias is impossible.
  const buf = new Uint32Array(length);
  let out = '';
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const v = buf[i]!;
      // Use top 30 bits to avoid modulo bias against base 10.
      if (v < 0xfffffff6) out += String((v % 10) | 0);
    }
  }
  return out;
}

/** SHA-256 hash of a UTF-8 string, encoded as base64url. */
export async function hashToken(plain: string): Promise<string> {
  const enc = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Constant-time equality on equal-length strings. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
