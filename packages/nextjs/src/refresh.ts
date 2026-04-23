import type { HoleauthInstance, IssuedTokens, SessionData } from '@holeauth/core';
import { getSessionOrRefresh as coreGetSessionOrRefresh } from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import { parseCookies, writeAuthCookies } from './cookies.js';

export interface RequestRefreshResult {
  session: SessionData | null;
  tokens: IssuedTokens | null;
  refreshed: boolean;
  /**
   * Set-Cookie header values to forward on the outgoing response when a refresh
   * occurred. Empty when nothing rotated.
   */
  setCookieHeaders: string[];
}

/**
 * Read the access + refresh cookies from a `Request`, validate the access JWT
 * and (transparently) rotate the refresh token if needed. Returns the resolved
 * session plus any `Set-Cookie` strings the caller must forward on its
 * response.
 *
 * Designed for server middleware that already runs in a Node-capable runtime
 * (Route Handlers, tRPC, Hono, …) and has the full `auth` instance with
 * adapters available.
 *
 * @example tRPC context
 * ```ts
 * export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
 *   const { session, setCookieHeaders } = await getSessionOrRefresh(req, auth);
 *   for (const c of setCookieHeaders) resHeaders.append('Set-Cookie', c);
 *   return { session };
 * }
 * ```
 */
export async function getSessionOrRefresh(
  req: Request,
  instance: HoleauthInstance,
): Promise<RequestRefreshResult> {
  const cfg = instance.config;
  const jar = parseCookies(req.headers.get('cookie'));
  const accessToken = jar[cookieName(cfg, 'access')];
  const refreshToken = jar[cookieName(cfg, 'refresh')];

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const result = await coreGetSessionOrRefresh(instance, {
    accessToken,
    refreshToken,
    ip,
    userAgent,
  });

  const setCookieHeaders: string[] = [];
  if (result.tokens) {
    const headers = new Headers();
    writeAuthCookies(cfg, headers, result.tokens);
    // Headers.getSetCookie() returns each Set-Cookie individually (Node 18.14+).
    const list =
      typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
    for (const c of list) setCookieHeaders.push(c);
  }

  return { ...result, setCookieHeaders };
}
