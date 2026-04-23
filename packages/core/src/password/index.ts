/**
 * Runtime-agnostic password hashing.
 * - Node: tries to load @node-rs/argon2 (optionalDependency).
 * - Edge / fallback: PBKDF2 via WebCrypto (SHA-256, 100k iterations).
 *
 * Hash format: "<scheme>$<params>$<salt_b64>$<hash_b64>"
 *   scheme = "argon2id" | "pbkdf2-sha256"
 */

const ITER = 100_000;
const KEYLEN = 32;
const SALT_LEN = 16;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey('raw', keyMaterial as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' },
    key,
    KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

async function tryArgon2(): Promise<typeof import('@node-rs/argon2') | null> {
  try {
    // Use a regular dynamic import with bundler-ignore magic comments.
    // `@node-rs/argon2` is declared in `serverExternalPackages` by consumers
    // (Next.js) and is an optional peer of this package, so Node's native
    // resolver handles it at runtime.
    const mod = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */
      '@node-rs/argon2'
    ).catch(() => null)) as typeof import('@node-rs/argon2') | null;
    return mod ?? null;
  } catch {
    return null;
  }
}

export async function hash(password: string): Promise<string> {
  const argon = await tryArgon2();
  if (argon) {
    return argon.hash(password); // native argon2id encoded string
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const h = await pbkdf2Hash(password, salt);
  return `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(h)}`;
}

export async function verify(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2')) {
    const argon = await tryArgon2();
    if (!argon) return false;
    return argon.verify(stored, password);
  }
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterStr || !saltB64 || !hashB64) return false;
  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  const keyMaterial = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey('raw', keyMaterial as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: Number(iterStr), hash: 'SHA-256' },
    key,
    expected.length * 8,
  );
  const out = new Uint8Array(bits);
  if (out.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < out.length; i++) diff |= out[i]! ^ expected[i]!;
  return diff === 0;
}
