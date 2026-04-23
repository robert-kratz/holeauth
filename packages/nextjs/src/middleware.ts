import { NextResponse, type NextRequest } from 'next/server';
import * as sessionMod from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import type { HoleauthConfig } from '@holeauth/core';

export interface MiddlewareOptions {
  config: HoleauthConfig;
  /**
   * Paths that require a valid session. Mutually exclusive with `protectAllExcept`.
   * If both are omitted, every route reaching the middleware is protected.
   */
  protect?: (string | RegExp)[];
  /**
   * Inverse of `protect`: every path is protected EXCEPT those listed here.
   * Useful when you want a "secure-by-default" app and only whitelist public
   * pages (e.g. `/login`, `/register`, `/api/auth`). Mutually exclusive with
   * `protect`.
   */
  protectAllExcept?: (string | RegExp)[];
  /** Where to send unauthenticated users. */
  signInPath?: string;
  /** Where to send users whose sign-in is pending a plugin challenge (2FA, etc.). */
  pendingPath?: string;
  /**
   * When the access token is missing/expired but a refresh cookie is present,
   * sub-request the refresh endpoint to rotate tokens instead of bouncing the
   * user to sign-in. Default: `true`.
   */
  refreshOnExpired?: boolean;
  /**
   * Mount point of the auth dispatcher. Used to build the refresh sub-request
   * URL. Default: `/api/auth`.
   */
  basePath?: string;
}

/**
 * Edge-compatible: only reads cookies + verifies access JWT. If the access
 * token is missing/expired but a refresh cookie is present, the middleware
 * sub-requests `${basePath}/refresh` and forwards the rotated cookies on a
 * `NextResponse.next()` — keeping the user signed in across page reloads.
 *
 * If a pending-2fa cookie is present and the user is heading to a protected
 * path, they get redirected to `pendingPath` instead of `signInPath`.
 */
export function holeauthMiddleware(opts: MiddlewareOptions) {
  const refreshOnExpired = opts.refreshOnExpired ?? true;
  const basePath = opts.basePath ?? '/api/auth';

  if (opts.protect && opts.protectAllExcept) {
    throw new Error(
      '[holeauth] holeauthMiddleware: pass either `protect` or `protectAllExcept`, not both.',
    );
  }

  const matches = (patterns: (string | RegExp)[], pathname: string) =>
    patterns.some((p) => (typeof p === 'string' ? pathname.startsWith(p) : p.test(pathname)));

  return async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const needsAuth = opts.protectAllExcept
      ? !matches(opts.protectAllExcept, pathname)
      : opts.protect
        ? matches(opts.protect, pathname)
        : true;
    if (!needsAuth) return NextResponse.next();

    const accessName = cookieName(opts.config, 'access');
    const refreshName = cookieName(opts.config, 'refresh');
    const pendingName = cookieName(opts.config, 'pending');

    const token = req.cookies.get(accessName)?.value;
    const session = token ? await sessionMod.validateSession(opts.config, token) : null;
    if (session) return NextResponse.next();

    // Try to rotate using the refresh cookie before bouncing the user.
    if (refreshOnExpired && req.cookies.get(refreshName)?.value) {
      const rotated = await tryRotateViaSubrequest(req, basePath);
      if (rotated) return rotated;
    }

    const url = req.nextUrl.clone();
    const pending = req.cookies.get(pendingName)?.value;
    if (pending) {
      url.pathname = opts.pendingPath ?? '/2fa/verify';
    } else {
      url.pathname = opts.signInPath ?? '/login';
      url.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(url);
  };
}

/**
 * POSTs to the in-app refresh endpoint, forwarding the user's cookies. On
 * success returns a `NextResponse.next()` carrying the new Set-Cookie headers
 * so the rotated tokens are persisted on the same navigation.
 */
async function tryRotateViaSubrequest(
  req: NextRequest,
  basePath: string,
): Promise<NextResponse | null> {
  try {
    const refreshUrl = new URL(`${basePath}/refresh`, req.nextUrl.origin);
    const resp = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        cookie: req.headers.get('cookie') ?? '',
        'content-type': 'application/json',
      },
      body: '{}',
      redirect: 'manual',
    });
    if (!resp.ok) return null;

    const next = NextResponse.next();
    const getter = (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies =
      typeof getter === 'function'
        ? getter.call(resp.headers)
        : resp.headers.get('set-cookie')
        ? [resp.headers.get('set-cookie') as string]
        : [];
    for (const c of setCookies) next.headers.append('Set-Cookie', c);
    return next;
  } catch {
    return null;
  }
}
