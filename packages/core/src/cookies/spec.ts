import type { HoleauthConfig } from '../types/index.js';

export interface CookieSpec {
  name: string;
  value: string;
  maxAge?: number; // seconds; 0 means delete
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain?: string;
}

export type CookieName = 'access' | 'refresh' | 'csrf' | 'pending' | 'oauthState' | 'oauthPkce';

export function cookieName(cfg: HoleauthConfig, kind: CookieName): string {
  const prefix = cfg.tokens?.cookiePrefix ?? 'holeauth';
  switch (kind) {
    case 'access':     return `${prefix}.at`;
    case 'refresh':    return `${prefix}.rt`;
    case 'csrf':       return `${prefix}.csrf`;
    case 'pending':    return `${prefix}.pending`;
    case 'oauthState': return `${prefix}.oauth.state`;
    case 'oauthPkce':  return `${prefix}.oauth.pkce`;
  }
}

export function isProduction(): boolean {
  return (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'production';
}

export interface BuildCookieInput {
  kind: CookieName;
  value: string;
  maxAge?: number; // seconds; 0 deletes
  /** CSRF is readable by JS — everything else is httpOnly. */
  httpOnly?: boolean;
  /** Override SameSite for the OAuth hop. */
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
}

export function buildCookie(cfg: HoleauthConfig, input: BuildCookieInput): CookieSpec {
  const httpOnly = input.httpOnly ?? input.kind !== 'csrf';
  const secure = cfg.tokens?.cookieSecure ?? isProduction();
  return {
    name: cookieName(cfg, input.kind),
    value: input.value,
    maxAge: input.maxAge,
    httpOnly,
    secure,
    sameSite: input.sameSite ?? cfg.tokens?.sameSite ?? 'lax',
    path: input.path ?? '/',
    domain: cfg.tokens?.cookieDomain,
  };
}

/** RFC 6265 serialisation used by Set-Cookie headers. */
export function serializeCookie(c: CookieSpec): string {
  const parts = [`${c.name}=${encodeURIComponent(c.value)}`];
  parts.push(`Path=${c.path}`);
  if (c.domain) parts.push(`Domain=${c.domain}`);
  if (c.maxAge !== undefined) {
    parts.push(`Max-Age=${c.maxAge}`);
    if (c.maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (c.httpOnly) parts.push('HttpOnly');
  if (c.secure) parts.push('Secure');
  parts.push(`SameSite=${c.sameSite.charAt(0).toUpperCase()}${c.sameSite.slice(1)}`);
  return parts.join('; ');
}

export function deleteCookie(cfg: HoleauthConfig, kind: CookieName): CookieSpec {
  return buildCookie(cfg, { kind, value: '', maxAge: 0 });
}
