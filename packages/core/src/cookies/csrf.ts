/**
 * Double-submit CSRF protection.
 * The cookie holeauth.csrf is readable by JS (httpOnly:false). The client
 * echoes its value in header `x-csrf-token`; the server compares the two.
 * Because cross-origin JS cannot read the cookie, an attacker cannot mint
 * a matching header, defeating the cross-site POST scenario.
 */

const b64urlChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += b64urlChars[b % 64];
  return out;
}

/** Constant-time compare. */
export function verifyCsrf(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  if (!cookieValue || !headerValue) return false;
  if (cookieValue.length !== headerValue.length) return false;
  let diff = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ headerValue.charCodeAt(i);
  }
  return diff === 0;
}

export const CSRF_HEADER = 'x-csrf-token';
