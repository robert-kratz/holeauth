/**
 * PKCE helpers (RFC 7636).
 *
 * S256 method: verifier is hashed with SHA-256 and base64url-encoded.
 * plain method: verifier equals challenge (not recommended).
 */

function bufferToB64url(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Compute the S256 challenge for a given verifier. */
export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return bufferToB64url(digest);
}

export async function verifyPkce(input: {
  verifier: string;
  challenge: string;
  method: 'S256' | 'plain';
}): Promise<boolean> {
  if (input.method === 'plain') return input.verifier === input.challenge;
  const expected = await s256Challenge(input.verifier);
  return expected === input.challenge;
}

export function randomVerifier(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bufferToB64url(bytes);
}
