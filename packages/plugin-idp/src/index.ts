/**
 * @holeauth/plugin-idp
 *
 * OpenID Connect + OAuth 2.0 Identity Provider plugin for holeauth.
 *
 * Implements:
 *   - Authorization Code flow with PKCE (public + confidential clients)
 *   - Refresh Token rotation with family-revoke on reuse (matches holeauth core)
 *   - OIDC Discovery + JWKS + userinfo
 *   - Token revocation (RFC 7009)
 *   - RP-initiated logout (/oauth2/end-session)
 *   - Team-based app ownership (owner/developer roles)
 *   - Remembered consent (per user × app × scope-set)
 *
 * Access tokens are JWT (RS256 by default) signed with IdP-owned keys —
 * NOT the holeauth core session secret. Refresh tokens are opaque and
 * stored as SHA-256 hashes.
 */
import {
  definePlugin,
  type HoleauthPlugin,
  type PluginContext,
  type PluginRouteContext,
} from '@holeauth/core';
import { HoleauthError } from '@holeauth/core/errors';
import { revokeSession as coreRevokeSession } from '@holeauth/core/session';
import type { IdpAdapter } from './adapter.js';
import type {
  AppType,
  IdpApp,
  IdpRefreshToken,
  IdpSigningKey,
  IdpTeam,
  IdpTeamMember,
  SigningAlg,
  TeamRole,
} from './types.js';
import { ensureSigningKey, rotateSigningKey, buildJwks } from './keys.js';
import {
  randomToken,
  sha256Hex,
  signAccessToken,
  signIdToken,
  verifyAccessToken,
} from './jwt.js';
import { verifyPkce } from './pkce.js';
import {
  BUILTIN_SCOPES,
  claimsForUser,
  formatScope,
  intersectScopes,
  parseScope,
} from './scopes.js';
import { renderConsentPage } from './consent-page.js';
import {
  createMemoryRateLimiter,
  type IdpRateLimiter,
} from './rate-limit.js';

export type { IdpAdapter } from './adapter.js';
export * from './types.js';
export { rotateSigningKey, ensureSigningKey } from './keys.js';
export { renderConsentPage } from './consent-page.js';
export {
  createMemoryRateLimiter,
  type IdpRateLimiter,
  type MemoryRateLimiterOptions,
} from './rate-limit.js';

const PLUGIN_ID = 'idp' as const;

/**
 * Max input length for client-supplied strings. Anything over this is
 * rejected outright — OAuth values are bounded (UUIDs, URLs, scope lists).
 */
const MAX_STRING_LENGTH = 2048;

/** Sanitize a client-supplied string. Throws an OAuth `invalid_request`. */
function sanitizeString(
  raw: unknown,
  field: string,
  opts: { optional?: boolean; maxLength?: number } = {},
): string | undefined {
  if (raw == null || raw === '') {
    if (opts.optional) return undefined;
    throw httpError('invalid_request', `${field} required`, 400);
  }
  if (typeof raw !== 'string') {
    throw httpError('invalid_request', `${field} must be a string`, 400);
  }
  const max = opts.maxLength ?? MAX_STRING_LENGTH;
  if (raw.length > max) {
    throw httpError('invalid_request', `${field} too long`, 400);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw httpError('invalid_request', `${field} contains control chars`, 400);
  }
  return raw;
}

/**
 * Constant-time string comparison. Inputs must be the same length for the
 * comparison to return true; callers should use pre-hashed values.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/* ──────────────────────────── options ──────────────────────────── */

export interface IdpOptions {
  adapter: IdpAdapter;
  /** OIDC issuer URL. MUST match exactly what clients discover. */
  issuer: string;
  /** Default supported scopes. Default: openid, profile, email, offline_access. */
  scopesSupported?: string[];
  /** Access token TTL (seconds). Default 900 (15m). */
  accessTokenTtl?: number;
  /** ID token TTL (seconds). Default 900 (15m). */
  idTokenTtl?: number;
  /** Refresh token TTL (seconds). Default 2_592_000 (30d). */
  refreshTokenTtl?: number;
  /** Authorization code TTL (seconds). Default 600 (10m). */
  authorizationCodeTtl?: number;
  /** Signing algorithm. Default RS256. */
  signingAlg?: SigningAlg;
  /**
   * Permission node required to create a new OAuth app via the API.
   * Checked against plugin-rbac when present; ignored otherwise. Default
   * `idp.apps.create`.
   */
  createAppPermission?: string;
  /**
   * Permission node that allows admin access to ALL apps (list/modify
   * apps the caller does not own). Default `idp.apps.admin`.
   */
  adminAppPermission?: string;
  /**
   * Rate limiter applied to the token endpoint. Protects against brute
   * force on client_secret / refresh_token values. Pass `false` to
   * disable (not recommended). Defaults to an in-memory limiter with
   * 20 attempts / 60s / key.
   */
  tokenRateLimiter?: IdpRateLimiter | false;
}

/* ──────────────────────────── api ──────────────────────────── */

export interface IdpApi {
  /** OIDC metadata used to build the discovery document. */
  meta: {
    issuer: string;
    scopesSupported: string[];
  };

  apps: {
    /** Create a new OAuth app in one of the caller's teams. Returns the raw
     * client_secret ONCE for confidential apps — it is hashed before
     * storage and cannot be retrieved later. */
    create(
      callerUserId: string,
      input: {
        name: string;
        description?: string | null;
        type: AppType;
        redirectUris: string[];
        allowedScopes?: string[];
        requirePkce?: boolean;
        teamId?: string;
      },
    ): Promise<{ app: IdpApp; clientSecret?: string }>;

    /** List all apps the user has access to (via team membership). */
    listForUser(userId: string): Promise<IdpApp[]>;

    /** Admin list: all apps. */
    listAll(): Promise<IdpApp[]>;

    /** Fetch by id — caller must be a team member. */
    get(callerUserId: string, appId: string, opts?: { admin?: boolean }): Promise<IdpApp>;

    update(
      callerUserId: string,
      appId: string,
      patch: {
        name?: string;
        description?: string | null;
        logoUrl?: string | null;
        redirectUris?: string[];
        allowedScopes?: string[];
        requirePkce?: boolean;
        disabled?: boolean;
      },
      opts?: { admin?: boolean },
    ): Promise<IdpApp>;

    regenerateSecret(
      callerUserId: string,
      appId: string,
    ): Promise<{ clientSecret: string }>;

    delete(callerUserId: string, appId: string, opts?: { admin?: boolean }): Promise<void>;
  };

  teams: {
    create(ownerUserId: string, name: string): Promise<IdpTeam>;
    listForUser(userId: string): Promise<Array<IdpTeam & { role: TeamRole }>>;
    listMembers(callerUserId: string, teamId: string): Promise<IdpTeamMember[]>;
    addMember(
      callerUserId: string,
      teamId: string,
      userId: string,
      role: TeamRole,
    ): Promise<void>;
    removeMember(callerUserId: string, teamId: string, userId: string): Promise<void>;
  };

  tokens: {
    listForApp(callerUserId: string, appId: string): Promise<IdpRefreshToken[]>;
    revokeAllForApp(callerUserId: string, appId: string): Promise<void>;
  };

  keys: {
    rotate(): Promise<IdpSigningKey>;
    bootstrap(): Promise<IdpSigningKey>;
  };

  /** Direct adapter access — escape hatch. */
  adapter: IdpAdapter;
}

export interface IdpPlugin extends HoleauthPlugin<typeof PLUGIN_ID, IdpApi> {}

/* ──────────────────────────── helpers ──────────────────────────── */

function httpError(code: string, message: string, status = 400): HoleauthError {
  return new HoleauthError(code, message, status);
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function oauthError(
  error: string,
  description?: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return json({ error, error_description: description, ...extra }, { status });
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const out: Record<string, string> = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }
  if (ct.includes('application/json')) {
    try {
      const j = (await req.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) if (v != null) out[k] = String(v);
      return out;
    } catch {
      return {};
    }
  }
  return {};
}

function parseBasicAuth(
  header: string | null,
): { user: string; pass: string } | null {
  if (!header || !header.toLowerCase().startsWith('basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return {
      user: decodeURIComponent(decoded.slice(0, i)),
      pass: decodeURIComponent(decoded.slice(i + 1)),
    };
  } catch {
    return null;
  }
}

function isRedirectUriAllowed(app: IdpApp, redirectUri: string): boolean {
  return app.redirectUris.includes(redirectUri);
}

async function ensureTeamOwner(
  adapter: IdpAdapter,
  teamId: string,
  userId: string,
): Promise<void> {
  const m = await adapter.teams.getMembership(teamId, userId);
  if (!m || m.role !== 'owner') {
    throw httpError('FORBIDDEN', 'owner role required', 403);
  }
}

async function ensureTeamMember(
  adapter: IdpAdapter,
  teamId: string,
  userId: string,
): Promise<IdpTeamMember> {
  const m = await adapter.teams.getMembership(teamId, userId);
  if (!m) throw httpError('FORBIDDEN', 'not a team member', 403);
  return m;
}

/**
 * Locate or auto-create a personal team for the user. Personal teams are
 * labeled "<email>'s team" and have exactly the user as owner. This keeps
 * the team model simple without forcing users to create a team upfront.
 */
async function ensurePersonalTeam(
  ctx: PluginContext,
  adapter: IdpAdapter,
  userId: string,
): Promise<IdpTeam> {
  const teams = await adapter.teams.listForUser(userId);
  const owned = teams.find((t) => t.role === 'owner');
  if (owned) return owned;
  const user = await ctx.core.getUserById(userId);
  const name = user?.email ? `${user.email}'s team` : `Team ${userId.slice(0, 8)}`;
  return adapter.teams.create({ name, ownerUserId: userId });
}

/* ──────────────────────────── plugin factory ──────────────────────────── */

export function idp(options: IdpOptions): IdpPlugin {
  const {
    adapter,
    issuer,
    scopesSupported = [...BUILTIN_SCOPES],
    accessTokenTtl = 900,
    idTokenTtl = 900,
    refreshTokenTtl = 60 * 60 * 24 * 30,
    authorizationCodeTtl = 600,
    signingAlg = 'RS256',
    createAppPermission = 'idp.apps.create',
    adminAppPermission = 'idp.apps.admin',
    tokenRateLimiter,
  } = options;

  const rateLimiter: IdpRateLimiter | null =
    tokenRateLimiter === false
      ? null
      : tokenRateLimiter ?? createMemoryRateLimiter();

  async function guardRate(
    key: string,
  ): Promise<Response | null> {
    if (!rateLimiter) return null;
    const r = await rateLimiter.check(key);
    if (r.ok) return null;
    return oauthError(
      'rate_limited',
      'too many requests — slow down',
      429,
      { retry_after: r.retryAfterSeconds },
    );
  }

  /* ────────── helpers needing `options` closure ────────── */

  type RbacShape = {
    can(userId: string, node: string): Promise<boolean>;
  };

  function getRbac(ctx: PluginContext): RbacShape | null {
    try {
      return ctx.getPlugin<RbacShape>('rbac');
    } catch {
      return null;
    }
  }

  async function canCreateApps(ctx: PluginContext, userId: string): Promise<boolean> {
    const rbac = getRbac(ctx);
    if (!rbac) return true; // no rbac installed → allow all
    return rbac.can(userId, createAppPermission);
  }

  async function isAppAdmin(ctx: PluginContext, userId: string): Promise<boolean> {
    const rbac = getRbac(ctx);
    if (!rbac) return false;
    return rbac.can(userId, adminAppPermission);
  }

  async function ensureAppAccess(
    ctx: PluginContext,
    appId: string,
    userId: string,
    opts: { admin?: boolean; ownerOnly?: boolean } = {},
  ): Promise<IdpApp> {
    const app = await adapter.apps.getById(appId);
    if (!app) throw httpError('NOT_FOUND', 'app not found', 404);
    if (opts.admin && (await isAppAdmin(ctx, userId))) return app;
    const mem = await adapter.teams.getMembership(app.teamId, userId);
    if (!mem) throw httpError('FORBIDDEN', 'not a team member', 403);
    if (opts.ownerOnly && mem.role !== 'owner') {
      throw httpError('FORBIDDEN', 'owner role required', 403);
    }
    return app;
  }

  async function authenticateClient(
    req: Request,
    body: Record<string, string>,
  ): Promise<{ app: IdpApp; isPublic: boolean }> {
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    const basic = parseBasicAuth(req.headers.get('authorization'));
    if (basic) {
      clientId = basic.user;
      clientSecret = basic.pass;
    } else {
      clientId = body.client_id;
      clientSecret = body.client_secret;
    }
    clientId = sanitizeString(clientId, 'client_id', { maxLength: 256 });
    if (clientSecret != null) {
      clientSecret = sanitizeString(clientSecret, 'client_secret', {
        optional: true,
        maxLength: 512,
      });
    }
    if (!clientId) throw httpError('invalid_client', 'missing client_id', 401);
    const app = await adapter.apps.getById(clientId);
    if (!app || app.disabledAt) throw httpError('invalid_client', 'unknown client', 401);
    if (app.type === 'confidential') {
      if (!clientSecret) throw httpError('invalid_client', 'missing client_secret', 401);
      if (!app.clientSecretHash) {
        throw httpError('invalid_client', 'client has no secret configured', 401);
      }
      const hash = await sha256Hex(clientSecret);
      // Constant-time compare to avoid timing oracle on the hex digest.
      if (!timingSafeEqual(hash, app.clientSecretHash)) {
        throw httpError('invalid_client', 'invalid client_secret', 401);
      }
      return { app, isPublic: false };
    }
    return { app, isPublic: true };
  }

  async function issueTokensFor(params: {
    ctx: PluginContext;
    app: IdpApp;
    userId: string;
    scope: string;
    nonce: string | null;
    authTime: number;
  }): Promise<{
    accessToken: string;
    accessExp: number;
    idToken: string | null;
    idExp: number | null;
    refreshToken: string | null;
    refreshExp: number | null;
    scope: string;
  }> {
    const { ctx, app, userId, scope, nonce, authTime } = params;
    const scopes = parseScope(scope);
    const key = await ensureSigningKey(adapter, signingAlg);

    const { token: accessToken, exp: accessExp } = await signAccessToken(key, {
      issuer,
      audience: app.id,
      subject: userId,
      scope,
      ttlSeconds: accessTokenTtl,
      extra: { client_id: app.id },
    });

    let idToken: string | null = null;
    let idExp: number | null = null;
    if (scopes.includes('openid')) {
      const user = await ctx.core.getUserById(userId);
      if (!user) throw httpError('invalid_grant', 'user not found', 400);
      const claims = claimsForUser(user, scopes);
      const signed = await signIdToken(key, {
        issuer,
        audience: app.id,
        subject: userId,
        nonce,
        authTime,
        claims,
        ttlSeconds: idTokenTtl,
      });
      idToken = signed.token;
      idExp = signed.exp;
    }

    let refreshToken: string | null = null;
    let refreshExp: number | null = null;
    if (scopes.includes('offline_access')) {
      const raw = randomToken(48);
      const hash = await sha256Hex(raw);
      const expiresAt = new Date(Date.now() + refreshTokenTtl * 1000);
      const familyId = crypto.randomUUID();
      await adapter.refresh.create({
        id: crypto.randomUUID(),
        tokenHash: hash,
        appId: app.id,
        userId,
        familyId,
        scope,
        expiresAt,
      });
      refreshToken = raw;
      refreshExp = Math.floor(expiresAt.getTime() / 1000);
    }

    return {
      accessToken,
      accessExp,
      idToken,
      idExp,
      refreshToken,
      refreshExp,
      scope,
    };
  }

  /* ──────────────────────────── routes ──────────────────────────── */

  const routes = buildRoutes();

  function buildRoutes() {
    return [
      /* ── Discovery ────────────────────────────────────────── */
      {
        method: 'GET' as const,
        path: '/.well-known/openid-configuration',
        async handler(): Promise<Response> {
          const body = {
            issuer,
            authorization_endpoint: `${issuer}/oauth2/authorize`,
            token_endpoint: `${issuer}/oauth2/token`,
            userinfo_endpoint: `${issuer}/oauth2/userinfo`,
            jwks_uri: `${issuer}/oauth2/jwks`,
            revocation_endpoint: `${issuer}/oauth2/revoke`,
            end_session_endpoint: `${issuer}/oauth2/end-session`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: [
              'client_secret_basic',
              'client_secret_post',
              'none',
            ],
            scopes_supported: scopesSupported,
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: [signingAlg],
          };
          return json(body);
        },
      },

      /* ── JWKS ─────────────────────────────────────────────── */
      {
        method: 'GET' as const,
        path: '/oauth2/jwks',
        async handler(): Promise<Response> {
          const body = await buildJwks(adapter);
          return json(body);
        },
      },

      /* ── Authorize (render consent or redirect) ──────────── */
      {
        method: 'GET' as const,
        path: '/oauth2/authorize',
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const url = new URL(rctx.req.url);
          const q = Object.fromEntries(url.searchParams) as Record<string, string>;
          const {
            response_type,
            client_id,
            redirect_uri,
            scope: rawScope,
            state,
            nonce,
            code_challenge,
            code_challenge_method,
          } = q;

          if (response_type !== 'code') {
            return oauthError('unsupported_response_type', 'only code flow supported');
          }
          if (!client_id || !redirect_uri) {
            return oauthError('invalid_request', 'client_id and redirect_uri required');
          }
          const app = await adapter.apps.getById(client_id);
          if (!app || app.disabledAt) {
            return oauthError('invalid_client', 'unknown or disabled client', 400);
          }
          if (!isRedirectUriAllowed(app, redirect_uri)) {
            return oauthError('invalid_request', 'redirect_uri not registered');
          }
          if (app.requirePkce || app.type === 'public') {
            if (!code_challenge) {
              return oauthError('invalid_request', 'PKCE code_challenge required');
            }
            if (code_challenge_method && code_challenge_method !== 'S256') {
              return oauthError('invalid_request', 'only S256 PKCE supported');
            }
          }

          // Determine session. If unauthenticated, 302 to /login?returnTo=<this url>.
          const session = await rctx.getSession();
          if (!session) {
            const returnTo = url.pathname + url.search;
            const loc = `/login?returnTo=${encodeURIComponent(returnTo)}`;
            return new Response(null, { status: 302, headers: { location: loc } });
          }

          // Normalize scopes (intersect with what the app is allowed to request).
          const requested = parseScope(rawScope);
          const granted = intersectScopes(requested, app.allowedScopes);
          if (requested.length > 0 && granted.length === 0) {
            return oauthError('invalid_scope', 'no requested scopes are granted by this app');
          }

          // Check remembered consent: if all requested scopes already consented,
          // issue code and redirect immediately.
          const remembered = await adapter.consent.get(session.userId, app.id);
          const allApproved =
            remembered &&
            granted.every((s) => remembered.scopesGranted.includes(s));
          if (allApproved) {
            return issueCodeAndRedirect({
              appId: app.id,
              userId: session.userId,
              redirectUri: redirect_uri,
              scope: formatScope(granted),
              state: state ?? null,
              nonce: nonce ?? null,
              codeChallenge: code_challenge ?? null,
              codeChallengeMethod:
                (code_challenge_method as 'S256' | 'plain' | undefined) ?? null,
            });
          }

          // Render consent.
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const csrf = rctx.cookies.get(`${prefix}.csrf`) ?? '';
          const user = await rctx.plugin.core.getUserById(session.userId);
          const html = renderConsentPage({
            appName: app.name,
            appLogoUrl: app.logoUrl,
            appDescription: app.description,
            redirectUri: redirect_uri,
            scopes: granted,
            userEmail: user?.email ?? session.userId,
            params: {
              response_type,
              client_id,
              redirect_uri,
              scope: formatScope(granted),
              state: state ?? '',
              nonce: nonce ?? '',
              code_challenge: code_challenge ?? '',
              code_challenge_method: code_challenge_method ?? '',
            },
            csrf,
            actionPath: stripIssuerOrigin(issuer) + '/oauth2/authorize/consent',
          });
          return new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        },
      },

      /* ── Authorize consent POST ──────────────────────────── */
      {
        method: 'POST' as const,
        path: '/oauth2/authorize/consent',
        requireAuth: true,
        // We verify CSRF manually from the form body (header-based
        // double-submit does not work with plain form POSTs).
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const body = await readForm(rctx.req);
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const csrfCookie = rctx.cookies.get(`${prefix}.csrf`);
          const csrfForm = body.csrfToken;
          if (!csrfCookie || !csrfForm || csrfCookie !== csrfForm) {
            return oauthError('invalid_request', 'CSRF check failed', 400);
          }
          const session = await rctx.getSession();
          if (!session) return oauthError('login_required', 'not authenticated', 401);

          const {
            client_id,
            redirect_uri,
            scope: rawScope,
            state,
            nonce,
            code_challenge,
            code_challenge_method,
            decision,
          } = body;

          if (!client_id || !redirect_uri) {
            return oauthError('invalid_request', 'missing params');
          }
          const app = await adapter.apps.getById(client_id);
          if (!app || app.disabledAt) return oauthError('invalid_client', 'unknown client');
          if (!isRedirectUriAllowed(app, redirect_uri)) {
            return oauthError('invalid_request', 'redirect_uri not registered');
          }

          if (decision !== 'approve') {
            const loc = appendParams(redirect_uri, {
              error: 'access_denied',
              state,
            });
            return new Response(null, { status: 302, headers: { location: loc } });
          }

          const granted = parseScope(rawScope);
          // Remember consent for future authorize calls.
          await adapter.consent.upsert(session.userId, app.id, granted);

          return issueCodeAndRedirect({
            appId: app.id,
            userId: session.userId,
            redirectUri: redirect_uri,
            scope: formatScope(granted),
            state: state || null,
            nonce: nonce || null,
            codeChallenge: code_challenge || null,
            codeChallengeMethod:
              (code_challenge_method as 'S256' | 'plain' | undefined) || null,
          });
        },
      },

      /* ── Token ───────────────────────────────────────────── */
      {
        method: 'POST' as const,
        path: '/oauth2/token',
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const body = await readForm(rctx.req);
          const grant = body.grant_type;
          const clientIdHint = (body.client_id ?? '').slice(0, 128);
          const ip = getClientIp(rctx.req);
          const rateKey = `token:${clientIdHint}:${ip}`;
          const limited = await guardRate(rateKey);
          if (limited) return limited;

          try {
            if (grant === 'authorization_code') {
              const clientAuth = await authenticateClient(rctx.req, body);
              const { app } = clientAuth;

              const code = sanitizeString(body.code, 'code', { maxLength: 512 })!;
              const redirectUri = sanitizeString(body.redirect_uri, 'redirect_uri', {
                maxLength: 2048,
              })!;
              const codeVerifier = sanitizeString(body.code_verifier, 'code_verifier', {
                optional: true,
                maxLength: 512,
              });
              const hash = await sha256Hex(code);
              const consumed = await adapter.codes.consume(hash);
              if (!consumed) return oauthError('invalid_grant', 'code invalid or reused');
              if (consumed.appId !== app.id) {
                return oauthError('invalid_grant', 'code issued to a different client');
              }
              if (consumed.redirectUri !== redirectUri) {
                return oauthError('invalid_grant', 'redirect_uri mismatch');
              }
              // Defensive: even if the adapter's consume() checks expiry, verify
              // here too so bugs in storage cannot issue tokens for stale codes.
              if (consumed.expiresAt.getTime() < Date.now()) {
                return oauthError('invalid_grant', 'code expired');
              }
              if (consumed.codeChallenge) {
                if (!codeVerifier) {
                  return oauthError('invalid_request', 'code_verifier required');
                }
                const ok = await verifyPkce({
                  verifier: codeVerifier,
                  challenge: consumed.codeChallenge,
                  method: consumed.codeChallengeMethod ?? 'S256',
                });
                if (!ok) return oauthError('invalid_grant', 'PKCE verification failed');
              } else if (app.requirePkce || app.type === 'public') {
                // Defense in depth — the authorize endpoint rejects missing PKCE
                // for these client classes, but never trust that alone.
                return oauthError('invalid_grant', 'PKCE required but missing from code');
              }

              const tokens = await issueTokensFor({
                ctx: rctx.plugin,
                app,
                userId: consumed.userId,
                scope: consumed.scope,
                nonce: consumed.nonce,
                authTime: Math.floor(Date.now() / 1000),
              });

              if (rateLimiter) await rateLimiter.reset(rateKey);
              return tokenResponse(tokens);
            }

            if (grant === 'refresh_token') {
              const clientAuth = await authenticateClient(rctx.req, body);
              const { app } = clientAuth;
              const refreshToken = sanitizeString(body.refresh_token, 'refresh_token', {
                maxLength: 512,
              })!;
              const hash = await sha256Hex(refreshToken);
              const row = await adapter.refresh.getByHash(hash);
              if (!row) return oauthError('invalid_grant', 'unknown refresh_token');
              if (row.appId !== app.id) {
                // cross-client use — revoke family for safety
                await adapter.refresh.revokeFamily(row.familyId);
                return oauthError('invalid_grant', 'wrong client for refresh_token');
              }
              if (row.revokedAt) {
                // REUSE DETECTION — revoke entire family.
                await adapter.refresh.revokeFamily(row.familyId);
                return oauthError('invalid_grant', 'refresh_token reused — family revoked');
              }
              if (row.expiresAt.getTime() < Date.now()) {
                return oauthError('invalid_grant', 'refresh_token expired');
              }

              // Rotate: mark current revoked, mint new row under same family.
              const requestedScope = body.scope ? body.scope : row.scope;
              // Cannot widen scope on refresh.
              const requested = parseScope(requestedScope);
              const original = parseScope(row.scope);
              const narrowed = requested.filter((s) => original.includes(s));
              const effectiveScope = formatScope(narrowed.length ? narrowed : original);

              const key = await ensureSigningKey(adapter, signingAlg);
              const { token: accessToken, exp: accessExp } = await signAccessToken(key, {
                issuer,
                audience: app.id,
                subject: row.userId,
                scope: effectiveScope,
                ttlSeconds: accessTokenTtl,
                extra: { client_id: app.id },
              });

              let idToken: string | null = null;
              let idExp: number | null = null;
              if (parseScope(effectiveScope).includes('openid')) {
                const user = await rctx.plugin.core.getUserById(row.userId);
                if (user) {
                  const claims = claimsForUser(user, parseScope(effectiveScope));
                  const signed = await signIdToken(key, {
                    issuer,
                    audience: app.id,
                    subject: row.userId,
                    nonce: null,
                    authTime: Math.floor(row.createdAt.getTime() / 1000),
                    claims,
                    ttlSeconds: idTokenTtl,
                  });
                  idToken = signed.token;
                  idExp = signed.exp;
                }
              }

              // Rotate refresh token.
              await adapter.refresh.markRevoked(row.id);
              const newRaw = randomToken(48);
              const newHash = await sha256Hex(newRaw);
              const newExpires = new Date(Date.now() + refreshTokenTtl * 1000);
              await adapter.refresh.create({
                id: crypto.randomUUID(),
                tokenHash: newHash,
                appId: app.id,
                userId: row.userId,
                familyId: row.familyId,
                scope: effectiveScope,
                expiresAt: newExpires,
              });

              if (rateLimiter) await rateLimiter.reset(rateKey);
              return tokenResponse({
                accessToken,
                accessExp,
                idToken,
                idExp,
                refreshToken: newRaw,
                refreshExp: Math.floor(newExpires.getTime() / 1000),
                scope: effectiveScope,
              });
            }

            return oauthError('unsupported_grant_type', `grant ${grant} not supported`);
          } catch (e) {
            if (e instanceof HoleauthError) {
              return oauthError(e.code, e.message, e.status);
            }
            throw e;
          }
        },
      },

      /* ── Userinfo ────────────────────────────────────────── */
      {
        method: 'GET' as const,
        path: '/oauth2/userinfo',
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const auth = rctx.req.headers.get('authorization');
          if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
            return new Response(
              JSON.stringify({ error: 'invalid_token' }),
              {
                status: 401,
                headers: {
                  'content-type': 'application/json',
                  'www-authenticate': 'Bearer',
                },
              },
            );
          }
          const token = auth.slice(7);
          const payload = await verifyAccessToken(adapter, token, { issuer });
          if (!payload || typeof payload.sub !== 'string') {
            return new Response(JSON.stringify({ error: 'invalid_token' }), {
              status: 401,
              headers: { 'content-type': 'application/json' },
            });
          }
          const user = await rctx.plugin.core.getUserById(payload.sub);
          if (!user) {
            return new Response(JSON.stringify({ error: 'invalid_token' }), {
              status: 401,
              headers: { 'content-type': 'application/json' },
            });
          }
          const scopes = parseScope(String(payload.scope ?? ''));
          const body = { sub: user.id, ...claimsForUser(user, scopes) };
          return json(body);
        },
      },

      /* ── Revoke (RFC 7009) ───────────────────────────────── */
      {
        method: 'POST' as const,
        path: '/oauth2/revoke',
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const body = await readForm(rctx.req);
          try {
            await authenticateClient(rctx.req, body);
          } catch {
            // Per RFC 7009 §2.2, unauthenticated clients get 200 to avoid
            // leaking which tokens are valid — but we still 401 if the
            // client_id is outright invalid.
          }
          const token = body.token;
          if (!token) return new Response(null, { status: 200 });
          const hash = await sha256Hex(token);
          const row = await adapter.refresh.getByHash(hash);
          if (row) await adapter.refresh.markRevoked(row.id);
          return new Response(null, { status: 200 });
        },
      },

      /* ── End-Session (RP-initiated logout) ───────────────── */
      {
        method: 'GET' as const,
        path: '/oauth2/end-session',
        async handler(rctx: PluginRouteContext): Promise<Response> {
          const url = new URL(rctx.req.url);
          const postLogoutRedirectUri = url.searchParams.get('post_logout_redirect_uri');
          const session = await rctx.getSession();
          if (session) {
            await coreRevokeSession(rctx.plugin.config, session.sessionId, session.userId);
            // Clear holeauth cookies.
            const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
            for (const name of [`${prefix}.at`, `${prefix}.rt`, `${prefix}.csrf`]) {
              rctx.setCookie({ name, value: '', maxAge: 0, httpOnly: true, path: '/' });
            }
          }
          const loc = postLogoutRedirectUri ?? '/';
          return new Response(null, { status: 302, headers: { location: loc } });
        },
      },
    ];
  }

  /* ────────── issueCodeAndRedirect ────────── */
  async function issueCodeAndRedirect(input: {
    appId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    state: string | null;
    nonce: string | null;
    codeChallenge: string | null;
    codeChallengeMethod: 'S256' | 'plain' | null;
  }): Promise<Response> {
    const code = randomToken(32);
    const hash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + authorizationCodeTtl * 1000);
    await adapter.codes.create({
      codeHash: hash,
      appId: input.appId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      nonce: input.nonce,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAt,
    });
    const loc = appendParams(input.redirectUri, {
      code,
      state: input.state ?? undefined,
    });
    return new Response(null, { status: 302, headers: { location: loc } });
  }

  /* ──────────────────────────── plugin ──────────────────────────── */

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter,

    hooks: {
      userDelete: {
        async after({ userId }, ctx) {
          try {
            await adapter.refresh.revokeAllForUser(userId);
          } catch (err) {
            ctx.logger.error(
              'idp: failed to revoke refresh tokens on user delete',
              { plugin: PLUGIN_ID, userId, err },
            );
          }
          // Team/app cleanup is owner-dependent — keep it simple: if
          // user was sole owner, apps remain but consumers should handle.
        },
      },
    },

    routes,

    api(ctx: PluginContext): IdpApi {
      return {
        meta: { issuer, scopesSupported },
        adapter,

        apps: {
          async create(callerUserId, input) {
            if (!(await canCreateApps(ctx, callerUserId))) {
              throw httpError('FORBIDDEN', `missing permission: ${createAppPermission}`, 403);
            }
            const teamId = input.teamId
              ? (await ensureTeamMember(adapter, input.teamId, callerUserId)).teamId
              : (await ensurePersonalTeam(ctx, adapter, callerUserId)).id;

            const id = crypto.randomUUID();
            let clientSecret: string | undefined;
            let clientSecretHash: string | null = null;
            if (input.type === 'confidential') {
              clientSecret = randomToken(32);
              clientSecretHash = await sha256Hex(clientSecret);
            }
            const app = await adapter.apps.create({
              id,
              teamId,
              name: input.name,
              description: input.description ?? null,
              logoUrl: null,
              type: input.type,
              clientSecretHash,
              redirectUris: input.redirectUris,
              allowedScopes: input.allowedScopes ?? [...BUILTIN_SCOPES],
              requirePkce: input.requirePkce ?? true,
            });
            return { app, clientSecret };
          },

          listForUser(userId) {
            return adapter.apps.listForUser(userId);
          },

          listAll() {
            return adapter.apps.listAll();
          },

          async get(callerUserId, appId, opts) {
            return ensureAppAccess(ctx, appId, callerUserId, { admin: opts?.admin });
          },

          async update(callerUserId, appId, patch, opts) {
            await ensureAppAccess(ctx, appId, callerUserId, {
              admin: opts?.admin,
              ownerOnly: !opts?.admin,
            });
            const current = (await adapter.apps.getById(appId))!;
            const next = await adapter.apps.update(appId, {
              name: patch.name,
              description: patch.description,
              logoUrl: patch.logoUrl,
              redirectUris: patch.redirectUris,
              allowedScopes: patch.allowedScopes,
              requirePkce: patch.requirePkce,
              disabledAt:
                patch.disabled === true
                  ? current.disabledAt ?? new Date()
                  : patch.disabled === false
                    ? null
                    : undefined,
            });
            return next;
          },

          async regenerateSecret(callerUserId, appId) {
            const app = await ensureAppAccess(ctx, appId, callerUserId, {
              ownerOnly: true,
            });
            if (app.type !== 'confidential') {
              throw httpError('INVALID', 'public clients have no secret', 400);
            }
            const raw = randomToken(32);
            const hash = await sha256Hex(raw);
            await adapter.apps.update(appId, { clientSecretHash: hash });
            return { clientSecret: raw };
          },

          async delete(callerUserId, appId, opts) {
            await ensureAppAccess(ctx, appId, callerUserId, {
              admin: opts?.admin,
              ownerOnly: !opts?.admin,
            });
            await adapter.refresh.revokeAllForApp(appId);
            await adapter.apps.delete(appId);
          },
        },

        teams: {
          create(ownerUserId, name) {
            return adapter.teams.create({ name, ownerUserId });
          },
          listForUser(userId) {
            return adapter.teams.listForUser(userId);
          },
          async listMembers(callerUserId, teamId) {
            await ensureTeamMember(adapter, teamId, callerUserId);
            return adapter.teams.listMembers(teamId);
          },
          async addMember(callerUserId, teamId, userId, role) {
            await ensureTeamOwner(adapter, teamId, callerUserId);
            await adapter.teams.addMember(teamId, userId, role);
          },
          async removeMember(callerUserId, teamId, userId) {
            await ensureTeamOwner(adapter, teamId, callerUserId);
            // Prevent removing the last owner.
            const members = await adapter.teams.listMembers(teamId);
            const owners = members.filter((m) => m.role === 'owner');
            if (owners.length === 1 && owners[0]!.userId === userId) {
              throw httpError('INVALID', 'cannot remove the last owner', 400);
            }
            await adapter.teams.removeMember(teamId, userId);
          },
        },

        tokens: {
          async listForApp(callerUserId, appId) {
            await ensureAppAccess(ctx, appId, callerUserId, { ownerOnly: true });
            return adapter.refresh.listForApp(appId);
          },
          async revokeAllForApp(callerUserId, appId) {
            await ensureAppAccess(ctx, appId, callerUserId, { ownerOnly: true });
            await adapter.refresh.revokeAllForApp(appId);
          },
        },

        keys: {
          rotate: () => rotateSigningKey(adapter, signingAlg),
          bootstrap: () => ensureSigningKey(adapter, signingAlg),
        },
      };
    },
  });
}

/* ──────────────────────────── tiny utils ──────────────────────────── */

function appendParams(
  url: string,
  params: Record<string, string | undefined | null>,
): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

function tokenResponse(t: {
  accessToken: string;
  accessExp: number;
  idToken: string | null;
  idExp: number | null;
  refreshToken: string | null;
  refreshExp: number | null;
  scope: string;
}): Response {
  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = {
    access_token: t.accessToken,
    token_type: 'Bearer',
    expires_in: t.accessExp - now,
    scope: t.scope,
  };
  if (t.idToken) body.id_token = t.idToken;
  if (t.refreshToken) body.refresh_token = t.refreshToken;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      pragma: 'no-cache',
    },
  });
}

/**
 * The issuer URL includes an origin. Plugin routes are mounted relative to
 * the auth basePath, so we strip the origin to get a same-origin path.
 */
function stripIssuerOrigin(issuer: string): string {
  try {
    const u = new URL(issuer);
    return u.pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}
