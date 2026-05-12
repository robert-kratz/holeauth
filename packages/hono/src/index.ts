import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  defineHoleauth,
  type HoleauthConfig,
  type HoleauthInstance,
  type HoleauthPlugin,
  type PluginsApi,
  type SessionData,
} from '@holeauth/core';
import { getSessionOrRefreshFromRequest } from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import { createDispatcher, type DispatchOptions } from './dispatch.js';
import { parseCookies } from './cookies.js';

export { createDispatcher, type DispatchOptions } from './dispatch.js';
export * from './cookies.js';
export { getSessionOrRefreshFromRequest, type RequestRefreshResult } from '@holeauth/core/session';

export type HoleauthHonoVariables = {
  holeauthSession: SessionData | null;
};

export type HonoHoleauth<
  Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
> = HoleauthInstance &
  PluginsApi<Plugins> & {
    /** Mount with `app.route('/api/auth', auth.app)`. */
    app: Hono;
  };

/* ──────────────────────────── handler ──────────────────────────── */

/**
 * Build a Hono sub-app that handles all holeauth core + plugin routes.
 *
 * ```ts
 * const auth = createHonoAuth({ ... });
 * app.route('/api/auth', auth.app);
 * ```
 */
export function createHonoAuth<
  const Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
>(
  config: Omit<HoleauthConfig, 'plugins'> & { plugins?: Plugins },
  opts: DispatchOptions = {},
): HonoHoleauth<Plugins> {
  const base = defineHoleauth(config);
  const app = createHonoAuthApp(base, opts);
  return { ...base, app } as HonoHoleauth<Plugins>;
}

/** Build a Hono sub-app from an existing `HoleauthInstance`. */
export function createHonoAuthApp(auth: HoleauthInstance, opts: DispatchOptions = {}): Hono {
  const dispatch = createDispatcher(auth, opts);
  const app = new Hono();

  // Hono passes the raw Web Request through `c.req.raw`. The dispatcher uses
  // `new URL(req.url).pathname` so we must reconstruct a request whose path
  // includes the mount prefix (Hono strips it). The dispatcher itself strips
  // its configured basePath.
  app.all('*', async (c) => {
    const inner = c.req.raw;
    // The basePath is part of the original request URL via the mount point;
    // Hono exposes the matched route path stripped, so we re-derive the full
    // path from `c.req.url` (which is unchanged) — but we still need to keep
    // the original URL. Hono's `c.req.raw.url` is the full URL — pass through.
    const webRes = await dispatch(inner);
    return webRes;
  });

  return app;
}

/* ───────────────────────── session helpers ─────────────────────── */

/**
 * Hono middleware that resolves `c.var.holeauthSession`. Use:
 *
 * ```ts
 * app.use('*', holeauthHonoMiddleware(auth));
 * app.get('/me', (c) => c.json({ session: c.get('holeauthSession') }));
 * ```
 */
export function holeauthHonoMiddleware(
  auth: HoleauthInstance,
): MiddlewareHandler<{ Variables: HoleauthHonoVariables }> {
  return async (c, next) => {
    const session = await getSession(c, auth);
    c.set('holeauthSession', session);
    await next();
  };
}

/** Read the current session from a Hono context. */
export async function getSession(
  c: Context,
  auth: HoleauthInstance,
): Promise<SessionData | null> {
  const cookieHeader = c.req.header('cookie') ?? null;
  const jar = parseCookies(cookieHeader);
  const token = jar[cookieName(auth.config, 'access')];
  if (!token) return null;
  return auth.getSession(token);
}

/* ─────────────────────── tRPC context factory ──────────────────── */

export interface HoleauthHonoContext {
  c: Context;
  req: Request;
  session: SessionData | null;
  /** True when the access token was silently rotated via the refresh token. */
  refreshed: boolean;
  auth: HoleauthInstance;
}

/**
 * Build a tRPC context factory for Hono — pair with `@hono/trpc-server`. The
 * returned function accepts the same shape passed by Hono's tRPC adapter.
 */
export function createHoleauthHonoContext(auth: HoleauthInstance) {
  return async function createContext(_opts: unknown, c: Context): Promise<HoleauthHonoContext> {
    const { session, refreshed, setCookieHeaders } = await getSessionOrRefreshFromRequest(c.req.raw, auth);
    for (const cookie of setCookieHeaders) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    return { c, req: c.req.raw, session, refreshed, auth };
  };
}

export type { HoleauthConfig } from '@holeauth/core';
