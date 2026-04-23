import { SignJWT, jwtVerify, decodeJwt, type JWTPayload } from 'jose';
import { InvalidTokenError } from '../errors/index.js';

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
}

export interface SignOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  expiresIn?: string | number; // e.g. '15m' or seconds
  jti?: string;
}

export async function sign(
  payload: JWTPayload,
  secret: string | Uint8Array,
  opts: SignOptions = {},
): Promise<string> {
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (opts.issuer) jwt.setIssuer(opts.issuer);
  if (opts.audience) jwt.setAudience(opts.audience);
  if (opts.subject) jwt.setSubject(opts.subject);
  if (opts.jti) jwt.setJti(opts.jti);
  if (opts.expiresIn !== undefined) jwt.setExpirationTime(opts.expiresIn);
  return jwt.sign(toKey(secret));
}

export async function verify<T extends JWTPayload = JWTPayload>(
  token: string,
  secret: string | Uint8Array,
): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, toKey(secret));
    return payload as T;
  } catch (e) {
    throw new InvalidTokenError((e as Error).message);
  }
}

export function decode<T extends JWTPayload = JWTPayload>(token: string): T {
  try {
    return decodeJwt(token) as T;
  } catch (e) {
    throw new InvalidTokenError((e as Error).message);
  }
}
