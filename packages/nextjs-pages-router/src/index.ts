/**
 * Next.js Pages Router bindings for holeauth.
 *
 * Provides:
 *   - createPagesAuthHandler(auth, opts) — Next API route handler (req, res) => Promise<void>
 *   - getServerSidePropsSession(ctx, config) — read session in GSSP
 *   - withAuth(handler, config, opts) — GSSP HOF with optional RBAC guard
 *   - createHoleauthPagesContext(auth) — tRPC context factory
 *
 * Internally bridges Node.js IncomingMessage / ServerResponse to the Web API
 * (Request / Response) so we can reuse the shared dispatcher in `./dispatch.js`.
 */
import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  NextApiHandler,
  NextApiRequest,
  NextApiResponse,
} from 'next';
import {
  defineHoleauth,
  type HoleauthConfig,
  type HoleauthInstance,
  type HoleauthPlugin,
  type PluginsApi,
  type SessionData,
} from '@holeauth/core';
import * as sessionMod from '@holeauth/core/session';
import { getSessionOrRefresh as coreGetSessionOrRefresh, getSessionOrRefreshFromRequest } from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import { createDispatcher, type DispatchOptions } from './dispatch.js';
import { parseCookies, writeAuthCookies } from './cookies.js';

export { createDispatcher, type DispatchOptions } from './dispatch.js';
export * from './cookies.js';
export { getSessionOrRefreshFromRequest, type RequestRefreshResult } from '@holeauth/core/session';

export type PagesHoleauth<
  Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
> = HoleauthInstance &
  PluginsApi<Plugins> & {
    /** Mount under `/pages/api/auth/[...holeauth].ts`. */
    handler: NextApiHandler;
  };

/* ──────────────────────────── handler ──────────────────────────── */

/**
 * Build a Next.js API route handler that dispatches all holeauth core + plugin
 * routes. Mount under `pages/api/auth/[...holeauth].ts`:
 *
 * ```ts
 * import { auth } from '@/lib/auth';
 * export default auth.handler;
 * ```
 */
export function createPagesAuthHandler<
  const Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
>(
  config: Omit<HoleauthConfig, 'plugins'> & { plugins?: Plugins },
  opts: DispatchOptions = {},
): PagesHoleauth<Plugins> {
  const base = defineHoleauth(config);
  const dispatch = createDispatcher(base, opts);

  const handler: NextApiHandler = async (req, res) => {
    const webReq = await toWebRequest(req);
    const webRes = await dispatch(webReq);
    await writeWebResponse(webRes, res);
  };

  return {
    ...base,
    handler,
  } as PagesHoleauth<Plugins>;
}

/* ────────────────────────── GSSP helpers ───────────────────────── */

/** Read the current session inside `getServerSideProps`. */
export async function getServerSidePropsSession(
  ctx: GetServerSidePropsContext,
  config: HoleauthConfig,
): Promise<SessionData | null> {
  const cookieHeader = ctx.req.headers.cookie ?? null;
  const jar = parseCookies(cookieHeader);
  const token = jar[cookieName(config, 'access')];
  if (!token) return null;
  return sessionMod.validateSession(config, token);
}

export interface WithAuthOptions {
  /** Redirect destination when no session is present. Default `/login`. */
  redirectTo?: string;
  /** If set, require the session to satisfy ALL of the given permissions. */
  permissions?: readonly string[];
  /** If set, require the session to belong to AT LEAST ONE of the given groups. */
  groups?: readonly string[];
  /** Redirect destination when permission/group check fails. Default `redirectTo`. */
  forbiddenRedirect?: string;
}

type GSSPHandler<P> = (
  ctx: GetServerSidePropsContext,
  session: SessionData,
) => Promise<GetServerSidePropsResult<P>> | GetServerSidePropsResult<P>;

/**
 * Wrap a getServerSideProps handler with a session guard. The wrapped handler
 * receives the authenticated `SessionData` as a second argument.
 */
export function withAuth<P extends Record<string, unknown> = Record<string, unknown>>(
  handler: GSSPHandler<P>,
  config: HoleauthConfig,
  opts: WithAuthOptions = {},
): GetServerSideProps<P> {
  const redirectTo = opts.redirectTo ?? '/login';
  const forbiddenRedirect = opts.forbiddenRedirect ?? redirectTo;

  return async (ctx) => {
    const session = await getServerSidePropsSession(ctx, config);
    if (!session) {
      return {
        redirect: { destination: redirectTo, permanent: false },
      };
    }

    if (opts.permissions && opts.permissions.length > 0) {
      const sessionPerms = (session as SessionData & { permissions?: readonly string[] }).permissions ?? [];
      const ok = opts.permissions.every((p) => sessionPerms.includes(p));
      if (!ok) return { redirect: { destination: forbiddenRedirect, permanent: false } };
    }

    if (opts.groups && opts.groups.length > 0) {
      const sessionGroups = (session as SessionData & { groups?: readonly string[] }).groups ?? [];
      const ok = opts.groups.some((g) => sessionGroups.includes(g));
      if (!ok) return { redirect: { destination: forbiddenRedirect, permanent: false } };
    }

    return handler(ctx, session);
  };
}

/* ─────────────────────── tRPC context factory ──────────────────── */

export interface HoleauthPagesContext {
  req: NextApiRequest;
  res: NextApiResponse;
  session: SessionData | null;
  /** True when the access token was silently rotated via the refresh token. */
  refreshed: boolean;
  auth: HoleauthInstance;
}

/**
 * Build a tRPC context factory for the Pages Router. The factory is shaped
 * for `@trpc/server/adapters/next` (Next API handler integration).
 */
export function createHoleauthPagesContext(auth: HoleauthInstance) {
  return async function createContext(opts: {
    req: NextApiRequest;
    res: NextApiResponse;
  }): Promise<HoleauthPagesContext> {
    const { req, res } = opts;
    const jar = parseCookies(req.headers.cookie ?? null);
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

async function toWebRequest(req: NextApiRequest): Promise<Request> {
  // Reconstruct a fully qualified URL. Next strips the host from req.url.
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ??
    ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const url = `${proto}://${host}${req.url ?? '/'}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
    else headers.set(k, String(v));
  }

  const method = (req.method ?? 'GET').toUpperCase();
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    // Next's body parser has already turned the request body into a JS object
    // by default. Re-serialize it so the dispatcher can call `req.json()`.
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (req.body instanceof Uint8Array) {
        // BufferSource is a valid BodyInit; cast through ArrayBuffer view.
        body = req.body.buffer.slice(
          req.body.byteOffset,
          req.body.byteOffset + req.body.byteLength,
        ) as ArrayBuffer;
      } else {
        body = JSON.stringify(req.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    }
  }

  return new Request(url, { method, headers, body });
}

async function writeWebResponse(webRes: Response, res: NextApiResponse): Promise<void> {
  res.status(webRes.status);

  // Set-Cookie may appear multiple times; iterate raw headers.
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return; // handled below
    res.setHeader(key, value);
  });
  // Web Headers.getSetCookie() is the standards-track way to read multiple.
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
