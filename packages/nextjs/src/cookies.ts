import type { HoleauthConfig, IssuedTokens } from '@holeauth/core';
import {
  buildCookie,
  deleteCookie,
  serializeCookie,
  cookieName,
  verifyCsrf,
  CSRF_HEADER,
} from '@holeauth/core/cookies';

/** Append one Set-Cookie header entry. Headers.append() preserves multiple values. */
export function setCookie(headers: Headers, cookie: string): void {
  headers.append('Set-Cookie', cookie);
}

/**
 * Apply a freshly-issued token bundle to a Response. Writes access + refresh
 * (httpOnly) plus the JS-readable CSRF cookie.
 */
export function writeAuthCookies(cfg: HoleauthConfig, headers: Headers, tokens: IssuedTokens): void {
  const accessTtl = cfg.tokens?.accessTtl ?? 900;
  const refreshTtl = cfg.tokens?.refreshTtl ?? 2592000;

  setCookie(
    headers,
    serializeCookie(buildCookie(cfg, { kind: 'access', value: tokens.accessToken, maxAge: accessTtl })),
  );
  setCookie(
    headers,
    serializeCookie(buildCookie(cfg, { kind: 'refresh', value: tokens.refreshToken, maxAge: refreshTtl, path: '/api/auth' })),
  );
  setCookie(
    headers,
    serializeCookie(buildCookie(cfg, { kind: 'csrf', value: tokens.csrfToken, maxAge: refreshTtl, httpOnly: false })),
  );
}

export function clearAuthCookies(cfg: HoleauthConfig, headers: Headers): void {
  setCookie(headers, serializeCookie(deleteCookie(cfg, 'access')));
  setCookie(headers, serializeCookie({ ...deleteCookie(cfg, 'refresh'), path: '/api/auth' }));
  setCookie(headers, serializeCookie(deleteCookie(cfg, 'csrf')));
  setCookie(headers, serializeCookie(deleteCookie(cfg, 'pending')));
}

export function writePending(cfg: HoleauthConfig, headers: Headers, pendingToken: string): void {
  const ttl = cfg.tokens?.pendingTtl ?? 300;
  setCookie(
    headers,
    serializeCookie(buildCookie(cfg, { kind: 'pending', value: pendingToken, maxAge: ttl })),
  );
}

/** Parse a Cookie header into a map. Next gives us a cookies API but we also
 *  work off raw Request here for edge compatibility. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

export function readCookie(req: Request, cfg: HoleauthConfig, kind: Parameters<typeof cookieName>[1]): string | undefined {
  const jar = parseCookies(req.headers.get('cookie'));
  return jar[cookieName(cfg, kind)];
}

/** Returns true if the double-submit CSRF check passes. */
export function checkCsrf(req: Request, cfg: HoleauthConfig): boolean {
  const cookie = readCookie(req, cfg, 'csrf');
  const header = req.headers.get(CSRF_HEADER);
  return verifyCsrf(cookie, header ?? undefined);
}
