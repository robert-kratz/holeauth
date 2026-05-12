import type { HoleauthConfig, HoleauthInstance, IssuedTokens, SessionData } from '../types/index.js';
import { cookieName, buildCookie, serializeCookie } from '../cookies/spec.js';
import { getSessionOrRefresh as coreGetSessionOrRefresh } from './get-or-refresh.js';

export interface RequestRefreshResult {
  /** Resolved session, or null if both validation and refresh failed. */
  session: SessionData | null;
  /** Freshly-issued token bundle when a refresh occurred; null otherwise. */
  tokens: IssuedTokens | null;
  /** True when the refresh token was rotated. */
  refreshed: boolean;
  /**
   * Ready-to-forward `Set-Cookie` header values. Empty when no rotation
   * occurred. The caller must append these to its outgoing response.
   */
  setCookieHeaders: string[];
}

/** Parse a raw Cookie header string into a name→value map. */
function parseCookies(header: string | null): Record<string, string> {
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

/** Serialize a freshly-issued token bundle into `Set-Cookie` strings. */
function buildSetCookieHeaders(cfg: HoleauthConfig, tokens: IssuedTokens): string[] {
  const accessTtl = cfg.tokens?.accessTtl ?? 900;
  const refreshTtl = cfg.tokens?.refreshTtl ?? 2592000;
  return [
    serializeCookie(buildCookie(cfg, { kind: 'access', value: tokens.accessToken, maxAge: accessTtl })),
    serializeCookie(buildCookie(cfg, { kind: 'refresh', value: tokens.refreshToken, maxAge: refreshTtl })),
    serializeCookie(buildCookie(cfg, { kind: 'csrf', value: tokens.csrfToken, maxAge: refreshTtl, httpOnly: false })),
  ];
}

/**
 * Read cookies from a Web API `Request`, validate the access token, and
 * transparently rotate the refresh token when needed.
 *
 * **Framework-agnostic** — works wherever the Web Fetch `Request` type is
 * available: Next.js App Router route handlers, Hono, plain `fetch` handlers,
 * tRPC fetch adapters, Cloudflare Workers, Deno, etc.
 *
 * The caller is responsible for forwarding `setCookieHeaders` on the response
 * when the result's `refreshed` flag is `true`.
 *
 * @example tRPC context (fetch adapter)
 * ```ts
 * import { getSessionOrRefreshFromRequest } from '@holeauth/core/session';
 *
 * export const createTrpcContext = createHoleauthContext(auth);
 * // internally calls getSessionOrRefreshFromRequest(req, auth)
 * ```
 *
 * @example Manual use in a route handler
 * ```ts
 * const { session, setCookieHeaders } = await getSessionOrRefreshFromRequest(req, auth);
 * for (const c of setCookieHeaders) resHeaders.append('Set-Cookie', c);
 * ```
 */
export async function getSessionOrRefreshFromRequest(
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

  const setCookieHeaders = result.tokens ? buildSetCookieHeaders(cfg, result.tokens) : [];

  return { ...result, setCookieHeaders };
}
