/**
 * Edge/runtime-agnostic base64url helpers. Avoids Node's `Buffer`.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function enc(n: number): string {
  return ALPHABET.charAt(n & 63);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += enc(n >> 18) + enc(n >> 12) + enc(n >> 6) + enc(n);
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += enc(n >> 18) + enc(n >> 12);
  } else if (rem === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += enc(n >> 18) + enc(n >> 12) + enc(n >> 6);
  }
  return out;
}

export function randomBase64Url(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToBase64Url(a);
}
