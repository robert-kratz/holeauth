import type { HoleauthConfig, HoleauthInstance, SignInResult, PluginRoute, PluginRouteContext } from '@holeauth/core';
import { HoleauthError, CsrfError } from '@holeauth/core/errors';
import { getRegistry } from '@holeauth/core';
import {
  readCookie,
  checkCsrf,
  writeAuthCookies,
  clearAuthCookies,
  writePending,
  parseCookies,
  setCookie,
} from './cookies.js';
import {
  buildCookie,
  serializeCookie,
  deleteCookie,
  cookieName,
} from '@holeauth/core/cookies';

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(e: unknown): Response {
  if (e instanceof HoleauthError) {
    return json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  // Duck-type fallback: `@holeauth/core` is built as multiple bundled
  // entrypoints (splitting: false), so a `HoleauthError` thrown from one
  // bundle (e.g. core/flows via dist/index.js) is not `instanceof` the
  // class re-imported from `@holeauth/core/errors` in this package.
  if (
    e instanceof Error &&
    e.name === 'HoleauthError' &&
    typeof (e as { code?: unknown }).code === 'string' &&
    typeof (e as { status?: unknown }).status === 'number'
  ) {
    const err = e as Error & { code: string; status: number };
    return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  // Log unexpected errors so they don't disappear into a generic 500.
  // eslint-disable-next-line no-console
  console.error('[holeauth] Unhandled error in request dispatch:', e);
  return json({ error: { code: 'INTERNAL', message: 'Internal error' } }, { status: 500 });
}

function getMeta(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  };
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}

function pathSegments(req: Request, basePath: string): string[] {
  const url = new URL(req.url);
  let p = url.pathname;
  if (p.startsWith(basePath)) p = p.slice(basePath.length);
  return p.split('/').filter(Boolean);
}

function writeTokens(cfg: HoleauthConfig, result: SignInResult): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (result.kind === 'ok') {
    writeAuthCookies(cfg, headers, result.tokens);
    setCookie(headers, serializeCookie(deleteCookie(cfg, 'pending')));
    return new Response(
      JSON.stringify({ ok: true, user: publicUser(result.user), csrfToken: result.tokens.csrfToken }),
      { status: 200, headers },
    );
  }
  writePending(cfg, headers, result.pendingToken);
  return new Response(
    JSON.stringify({
      ok: true,
      pending: true,
      pluginId: result.pluginId,
      userId: result.userId,
      data: result.data ?? null,
    }),
    { status: 200, headers },
  );
}

function publicUser(u: { id: string; email: string; name?: string | null; image?: string | null }) {
  return { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null };
}

/* ───────────────────── Plugin route matching ───────────────────── */

function matchPluginRoute(
  routes: readonly PluginRoute[],
  method: string,
  segs: string[],
): { route: PluginRoute; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const rSegs = r.path.split('/').filter(Boolean);
    if (rSegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rSegs.length; i++) {
      const a = rSegs[i]!;
      const b = segs[i]!;
      if (a.startsWith(':')) {
        params[a.slice(1)] = decodeURIComponent(b);
      } else if (a !== b) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

async function runPluginRoute(
  instance: HoleauthInstance,
  route: PluginRoute,
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const cfg = instance.config;
  const registry = getRegistry(instance);

  const jar = parseCookies(req.headers.get('cookie'));
  const responseHeaders = new Headers();
  const meta = getMeta(req);

  if (route.requireCsrf) {
    if (!checkCsrf(req, cfg)) throw new CsrfError();
  }

  const session = await (async () => {
    const at = readCookie(req, cfg, 'access');
    return at ? instance.getSession(at) : null;
  })();

  if (route.requireAuth && !session) {
    return json({ error: { code: 'UNAUTHENTICATED', message: 'authentication required' } }, { status: 401 });
  }

  const body = req.method === 'POST' ? await parseBody(req) : {};
  const ctx: PluginRouteContext = {
    req,
    body: { ...body, ...params },
    responseHeaders,
    cookies: { get: (name) => jar[name] },
    setCookie(spec) {
      const secure = (cfg.tokens?.cookieSecure ?? ((globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'production'));
      const parts = [`${spec.name}=${encodeURIComponent(spec.value)}`];
      parts.push(`Path=${spec.path ?? '/'}`);
      if (spec.maxAge !== undefined) parts.push(`Max-Age=${spec.maxAge}`);
      if (spec.httpOnly ?? true) parts.push('HttpOnly');
      if (secure) parts.push('Secure');
      const ss = spec.sameSite ?? cfg.tokens?.sameSite ?? 'lax';
      parts.push(`SameSite=${ss.charAt(0).toUpperCase()}${ss.slice(1)}`);
      setCookie(responseHeaders, parts.join('; '));
    },
    async getSession() {
      return session;
    },
    meta,
    plugin: registry.ctx,
  };

  const res = await route.handler(ctx);
  // Merge any headers the plugin appended into the returned response.
  if (responseHeaders.has('Set-Cookie')) {
    const merged = new Headers(res.headers);
    responseHeaders.forEach((v, k) => {
      if (k.toLowerCase() === 'set-cookie') merged.append('Set-Cookie', v);
      else merged.set(k, v);
    });
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: merged });
  }
  return res;
}

/* ─────────────────────────── Dispatcher ─────────────────────────── */

export interface DispatchOptions {
  /** Used to strip the prefix from pathnames. Default '/api/auth'. */
  basePath?: string;
  /** Default post-signin redirect destination (SSO callback). */
  defaultRedirect?: string;
}

/**
 * Build the unified GET/POST dispatcher. Mounted under `/api/auth/[...holeauth]`.
 *
 * Core routes take precedence; plugin routes are matched only if no core
 * route accepts the request.
 */
export function createDispatcher(
  instance: HoleauthInstance,
  opts: DispatchOptions = {},
): (req: Request) => Promise<Response> {
  const basePath = opts.basePath ?? '/api/auth';
  const cfg = instance.config;
  const registry = getRegistry(instance);

  return async function dispatch(req: Request): Promise<Response> {
    const segs = pathSegments(req, basePath);
    const method = req.method.toUpperCase();

    try {
      // ── GET /session ─────────────────────────────────────────
      if (method === 'GET' && segs[0] === 'session' && !segs[1]) {
        const at = readCookie(req, cfg, 'access');
        const session = at ? await instance.getSession(at) : null;
        return json({ session });
      }

      // ── GET /csrf ────────────────────────────────────────────
      if (method === 'GET' && segs[0] === 'csrf' && !segs[1]) {
        const existing = readCookie(req, cfg, 'csrf');
        return json({ csrfToken: existing ?? null });
      }

      // ── GET /invite/info?token=... ───────────────────────────
      if (method === 'GET' && segs[0] === 'invite' && segs[1] === 'info' && !segs[2]) {
        const url = new URL(req.url);
        const token = url.searchParams.get('token') ?? '';
        if (!token) return json({ error: { code: 'MISSING_TOKEN', message: 'token required' } }, { status: 400 });
        const info = await instance.getInviteInfo({ token });
        // Expose only fields intended for public pre-fill.
        return json({
          invite: {
            email: info.email,
            name: info.name ?? null,
            expiresAt: info.expiresAt,
            identifier: info.identifier,
          },
        });
      }

      // ── GET /invite/list ─────────────────────────────────────
      if (method === 'GET' && segs[0] === 'invite' && segs[1] === 'list' && !segs[2]) {
        const at = readCookie(req, cfg, 'access');
        const s = at ? await instance.getSession(at) : null;
        if (!s) return json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
        const invites = await instance.listInvites();
        return json({ invites });
      }

      // ── GET /authorize/:provider ─────────────────────────────
      if (method === 'GET' && segs[0] === 'authorize' && segs[1]) {
        const { url, state, codeVerifier } = await instance.sso.authorize(segs[1]);
        const headers = new Headers({ location: url });
        setCookie(headers, serializeCookie(buildCookie(cfg, {
          kind: 'oauthState', value: state, maxAge: 600, sameSite: 'lax',
        })));
        setCookie(headers, serializeCookie(buildCookie(cfg, {
          kind: 'oauthPkce', value: codeVerifier, maxAge: 600, sameSite: 'lax',
        })));
        return new Response(null, { status: 302, headers });
      }

      // ── GET /callback/:provider?code=&state= ─────────────────
      if (method === 'GET' && segs[0] === 'callback' && segs[1]) {
        const url = new URL(req.url);
        const code = url.searchParams.get('code') ?? '';
        const state = url.searchParams.get('state') ?? '';
        const jar = parseCookies(req.headers.get('cookie'));
        const storedState = jar[cookieName(cfg, 'oauthState')];
        const codeVerifier = jar[cookieName(cfg, 'oauthPkce')];
        if (!state || !storedState || state !== storedState || !codeVerifier) {
          return json({ error: { code: 'SSO_STATE_MISMATCH', message: 'state/pkce invalid' } }, { status: 400 });
        }
        const meta = getMeta(req);
        const { user, tokens } = await instance.sso.callback(segs[1], {
          code, state, codeVerifier, ip: meta.ip, userAgent: meta.userAgent,
        });
        const headers = new Headers({ location: opts.defaultRedirect ?? '/dashboard' });
        writeAuthCookies(cfg, headers, tokens);
        setCookie(headers, serializeCookie(deleteCookie(cfg, 'oauthState')));
        setCookie(headers, serializeCookie(deleteCookie(cfg, 'oauthPkce')));
        void user;
        return new Response(null, { status: 302, headers });
      }

      if (method === 'POST') {
        // POST /register
        if (segs[0] === 'register' && !segs[1]) {
          const body = await parseBody(req);
          const user = await instance.register({
            email: String(body.email ?? ''),
            password: String(body.password ?? ''),
            name: body.name ? String(body.name) : undefined,
          });
          return json({ ok: true, user: publicUser(user) });
        }

        // POST /signin  (password)
        if (segs[0] === 'signin' && !segs[1]) {
          const body = await parseBody(req);
          const meta = getMeta(req);
          const result = await instance.signIn({
            email: String(body.email ?? ''),
            password: String(body.password ?? ''),
            ip: meta.ip, userAgent: meta.userAgent,
          });
          return writeTokens(cfg, result);
        }

        // POST /signout
        if (segs[0] === 'signout' && !segs[1]) {
          if (!checkCsrf(req, cfg)) throw new CsrfError();
          const at = readCookie(req, cfg, 'access');
          const rt = readCookie(req, cfg, 'refresh');
          await instance.signOut({ accessToken: at, refreshToken: rt });
          const headers = new Headers({ 'content-type': 'application/json' });
          clearAuthCookies(cfg, headers);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
        }

        // POST /refresh
        if (segs[0] === 'refresh' && !segs[1]) {
          const rt = readCookie(req, cfg, 'refresh');
          if (!rt) return json({ error: { code: 'NO_REFRESH', message: 'no refresh token' } }, { status: 401 });
          const meta = getMeta(req);
          const tokens = await instance.refresh({ refreshToken: rt, ip: meta.ip, userAgent: meta.userAgent });
          const headers = new Headers({ 'content-type': 'application/json' });
          writeAuthCookies(cfg, headers, tokens);
          return new Response(JSON.stringify({ ok: true, csrfToken: tokens.csrfToken }), { status: 200, headers });
        }

        // POST /password/change
        if (segs[0] === 'password' && segs[1] === 'change' && !segs[2]) {
          if (!checkCsrf(req, cfg)) throw new CsrfError();
          const at = readCookie(req, cfg, 'access');
          const s = at ? await instance.getSession(at) : null;
          if (!s) return json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
          const body = await parseBody(req);
          await instance.changePassword({
            userId: s.userId,
            currentPassword: String(body.currentPassword ?? ''),
            newPassword: String(body.newPassword ?? ''),
            revokeOtherSessions: body.revokeOtherSessions !== false,
          });
          return json({ ok: true });
        }

        // POST /password/reset/request
        if (segs[0] === 'password' && segs[1] === 'reset' && segs[2] === 'request' && !segs[3]) {
          const body = await parseBody(req);
          await instance.requestPasswordReset({ email: String(body.email ?? '') });
          // Do not echo token — consumer is expected to have delivered it out-of-band.
          return json({ ok: true });
        }

        // POST /password/reset/consume
        if (segs[0] === 'password' && segs[1] === 'reset' && segs[2] === 'consume' && !segs[3]) {
          const body = await parseBody(req);
          await instance.consumePasswordReset({
            email: String(body.email ?? ''),
            token: String(body.token ?? ''),
            newPassword: String(body.newPassword ?? ''),
          });
          return json({ ok: true });
        }

        // POST /invite/create  (auth + CSRF)
        if (segs[0] === 'invite' && segs[1] === 'create' && !segs[2]) {
          if (!checkCsrf(req, cfg)) throw new CsrfError();
          const at = readCookie(req, cfg, 'access');
          const s = at ? await instance.getSession(at) : null;
          if (!s) return json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
          const body = await parseBody(req);
          const result = await instance.createInvite({
            email: String(body.email ?? ''),
            name: body.name != null ? String(body.name) : undefined,
            groupIds: Array.isArray(body.groupIds) ? (body.groupIds as unknown[]).map(String) : undefined,
            metadata: (body.metadata ?? null) as Record<string, unknown> | null,
            ttlSeconds: typeof body.ttlSeconds === 'number' ? body.ttlSeconds : undefined,
            invitedBy: s.userId,
          });
          return json({ ok: true, invite: result });
        }

        // POST /invite/consume  (public)
        if (segs[0] === 'invite' && segs[1] === 'consume' && !segs[2]) {
          const body = await parseBody(req);
          const meta = getMeta(req);
          const result = await instance.consumeInvite({
            token: String(body.token ?? ''),
            password: String(body.password ?? ''),
            name: body.name != null ? String(body.name) : undefined,
            autoSignIn: body.autoSignIn !== false,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
          if (result.tokens) {
            const headers = new Headers({ 'content-type': 'application/json' });
            writeAuthCookies(cfg, headers, result.tokens);
            return new Response(
              JSON.stringify({
                ok: true,
                user: publicUser(result.user),
                csrfToken: result.tokens.csrfToken,
                groupIds: result.groupIds ?? [],
              }),
              { status: 200, headers },
            );
          }
          return json({ ok: true, user: publicUser(result.user), groupIds: result.groupIds ?? [] });
        }

        // POST /invite/revoke  (auth + CSRF)
        if (segs[0] === 'invite' && segs[1] === 'revoke' && !segs[2]) {
          if (!checkCsrf(req, cfg)) throw new CsrfError();
          const at = readCookie(req, cfg, 'access');
          const s = at ? await instance.getSession(at) : null;
          if (!s) return json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
          const body = await parseBody(req);
          await instance.revokeInvite({ identifier: String(body.identifier ?? '') });
          return json({ ok: true });
        }
      }

      // ── Plugin routes ────────────────────────────────────────
      const match = matchPluginRoute(registry.routes, method, segs);
      if (match) {
        return runPluginRoute(instance, match.route, req, match.params);
      }

      return json({ error: { code: 'NOT_FOUND', message: 'route not found' } }, { status: 404 });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
