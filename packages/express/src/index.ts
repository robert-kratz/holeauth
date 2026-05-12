import type { Router, RequestHandler, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import express from 'express';
import {
  defineHoleauth,
  type HoleauthConfig,
  type HoleauthInstance,
  type HoleauthPlugin,
  type PluginsApi,
  type SessionData,
} from '@holeauth/core';
import { getSessionOrRefresh as coreGetSessionOrRefresh, getSessionOrRefreshFromRequest } from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import { createDispatcher, type DispatchOptions } from './dispatch.js';
import { parseCookies, writeAuthCookies } from './cookies.js';

export { createDispatcher, type DispatchOptions } from './dispatch.js';
export * from './cookies.js';
export { getSessionOrRefreshFromRequest, type RequestRefreshResult } from '@holeauth/core/session';

/** Extension type for Express requests after `holeauthSessionMiddleware`. */
export type RequestWithSession = ExpressRequest & { holeauthSession?: SessionData | null };

export type ExpressHoleauth<
  Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
> = HoleauthInstance &
  PluginsApi<Plugins> & {
    /** Mount with `app.use('/api/auth', auth.router)`. */
    router: Router;
  };

/* ──────────────────────────── router ──────────────────────────── */

/**
 * Build an Express router that handles all holeauth core + plugin routes.
 *
 * ```ts
 * const auth = createExpressAuth({ ... });
 * app.use('/api/auth', auth.router);
 * ```
 *
 * The router internally bridges Node IncomingMessage/ServerResponse to the
 * Web Fetch API and calls the shared dispatcher, so it is feature-equivalent
 * to the Next.js App Router handler.
 */
export function createExpressAuth<
  const Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
>(
  config: Omit<HoleauthConfig, 'plugins'> & { plugins?: Plugins },
  opts: DispatchOptions = {},
): ExpressHoleauth<Plugins> {
  const base = defineHoleauth(config);
  const router = holeauthExpressRouter(base, opts);
  return { ...base, router } as ExpressHoleauth<Plugins>;
}

/**
 * Build an Express router from an existing `HoleauthInstance`. Useful when
 * the auth instance is constructed elsewhere (e.g. shared with a worker).
 */
export function holeauthExpressRouter(
  auth: HoleauthInstance,
  opts: DispatchOptions = {},
): Router {
  const dispatch = createDispatcher(auth, opts);
  const router = express.Router();

  const bridge: RequestHandler = async (req, res, next) => {
    try {
      const webReq = toWebRequest(req, opts.basePath);
      const webRes = await dispatch(webReq);
      await writeWebResponse(webRes, res);
    } catch (e) {
      next(e);
    }
  };

  // Use a catch-all on the router itself; routes are matched inside the dispatcher.
  router.use(bridge);
  return router;
}

/* ───────────────────────── session helpers ─────────────────────── */

/**
 * Express middleware that resolves `req.holeauthSession` from the access-token
 * cookie. Does not require auth — handlers downstream decide what to do with
 * the null vs. populated session.
 */
export function holeauthSessionMiddleware(auth: HoleauthInstance): RequestHandler {
  return async (req, _res, next) => {
    try {
      (req as RequestWithSession).holeauthSession = await getSession(req, auth);
      next();
    } catch (e) {
      next(e as Error);
    }
  };
}

/** Read the current session from an Express request. */
export async function getSession(
  req: ExpressRequest,
  auth: HoleauthInstance,
): Promise<SessionData | null> {
  const cookieHeader = req.headers.cookie ?? null;
  const jar = parseCookies(cookieHeader);
  const token = jar[cookieName(auth.config, 'access')];
  if (!token) return null;
  return auth.getSession(token);
}

/* ─────────────────────── tRPC context factory ──────────────────── */

export interface HoleauthExpressContext {
  req: ExpressRequest;
  res: ExpressResponse;
  session: SessionData | null;
  /** True when the access token was silently rotated via the refresh token. */
  refreshed: boolean;
  auth: HoleauthInstance;
}

/**
 * Build a tRPC context factory for the Express adapter
 * (`@trpc/server/adapters/express`).
 */
export function createHoleauthExpressContext(auth: HoleauthInstance) {
  return async function createContext(opts: {
    req: ExpressRequest;
    res: ExpressResponse;
  }): Promise<HoleauthExpressContext> {
    const { req, res } = opts;
    const cookieHeader = req.headers.cookie ?? null;
    const jar = parseCookies(cookieHeader);
    const accessToken = jar[cookieName(auth.config, 'access')];
    const refreshToken = jar[cookieName(auth.config, 'refresh')];

    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      (req.headers['x-real-ip'] as string | undefined) ??
      undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;

    const result = await coreGetSessionOrRefresh(auth, { accessToken, refreshToken, ip, userAgent });

    if (result.tokens) {
      const responseHeaders = new Headers();
      writeAuthCookies(auth.config, responseHeaders, result.tokens);
      const setCookies =
        typeof (responseHeaders as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
          ? (responseHeaders as Headers & { getSetCookie: () => string[] }).getSetCookie()
          : (responseHeaders.get('set-cookie') ? [responseHeaders.get('set-cookie') as string] : []);
      if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    }

    return { req, res, session: result.session, refreshed: result.refreshed, auth };
  };
}

/* ─────────────────────── Node ⇄ Web bridge ─────────────────────── */

function toWebRequest(req: ExpressRequest, basePath: string | undefined): Request {
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ??
    (((req.socket as { encrypted?: boolean } | undefined)?.encrypted) ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  // req.originalUrl gives the full path including the mount prefix; req.url
  // gives the path relative to the router. The dispatcher strips basePath
  // itself, so we forward originalUrl when it's available.
  const path = (req.originalUrl ?? req.url ?? '/') as string;
  void basePath;
  const url = `${proto}://${host}${path}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
    else headers.set(k, String(v));
  }

  const method = (req.method ?? 'GET').toUpperCase();
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = (req as ExpressRequest & { body?: unknown }).body;
    if (raw !== undefined && raw !== null) {
      if (typeof raw === 'string') {
        body = raw;
      } else if (raw instanceof Uint8Array) {
        body = raw.buffer.slice(
          raw.byteOffset,
          raw.byteOffset + raw.byteLength,
        ) as ArrayBuffer;
      } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
        body = (raw as Buffer).buffer.slice(
          (raw as Buffer).byteOffset,
          (raw as Buffer).byteOffset + (raw as Buffer).byteLength,
        ) as ArrayBuffer;
      } else {
        body = JSON.stringify(raw);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    }
  }

  return new Request(url, { method, headers, body });
}

async function writeWebResponse(webRes: Response, res: ExpressResponse): Promise<void> {
  res.status(webRes.status);

  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  const setCookies =
    typeof (webRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (webRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [];
  if (setCookies.length > 0) {
    res.setHeader('Set-Cookie', setCookies);
  }

  if (webRes.body) {
    const buf = Buffer.from(await webRes.arrayBuffer());
    res.end(buf);
  } else {
    res.end();
  }
}

export type { HoleauthConfig } from '@holeauth/core';
