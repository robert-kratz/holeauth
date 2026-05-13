import {
  definePlugin,
  type PluginContext,
  type ChallengeResult,
  type HoleauthPlugin,
} from '@holeauth/core';
import type { AdapterUser } from '@holeauth/core/adapters';
import type { IssuedTokens } from '@holeauth/core';
import { HoleauthError, CredentialsError } from '@holeauth/core/errors';
import { issuePendingToken } from '@holeauth/core/flows';

import type {
  MagicLinkAdapter,
  MagicLinkRecord,
  MagicLinkTokenType,
} from './adapter.js';
import {
  constantTimeEquals,
  generateMagicToken,
  generateOtp,
  hashToken,
} from './token.js';
import {
  createMemoryRateLimiter,
  type MagicLinkRateLimiter,
} from './rate-limit.js';
import { createMemoryAdapter } from './memory-adapter.js';

export type { MagicLinkAdapter, MagicLinkRecord, MagicLinkTokenType, CreateMagicLinkInput } from './adapter.js';
export {
  createMemoryRateLimiter,
  type MagicLinkRateLimiter,
  type MemoryRateLimiterOptions,
} from './rate-limit.js';
export {
  generateMagicToken,
  generateOtp,
  hashToken,
  constantTimeEquals,
} from './token.js';

const MAX_EMAIL_LENGTH = 320;
const MAX_TOKEN_LENGTH = 128;
const MAX_OTP_LENGTH = 12;

const PLUGIN_ID = 'magicLink' as const;

export type MagicLinkMode = 'magic-link' | 'otp' | 'both';
export type MagicLinkRole = 'primary' | 'secondFactor';
/** Controls which flow the plugin accepts.
 * - `'login'`    — only existing users; unknown emails are silently ignored.
 * - `'register'` — only new users; existing emails are silently ignored.
 * - `'both'`     — default, same as previous behaviour. */
export type MagicLinkUseFor = 'login' | 'register' | 'both';

/** Payload handed to `sendEmail`. `url` is present for magic-link tokens,
 *  `code` for OTP tokens. Consumers can render either branch. */
export interface SendEmailArgs {
  email: string;
  /** Magic-link URL (consume endpoint with `?token=...`). Set when `type === 'magic-link'`. */
  url?: string;
  /** OTP code (plaintext). Set when `type === 'otp'`. */
  code?: string;
  type: MagicLinkTokenType;
  /** Unix-ms expiry. */
  expiresAt: number;
}

export interface MagicLinkOptions {
  /**
   * Plugin-owned storage. Use `@holeauth/magic-link-drizzle` for production.
   * When omitted, an in-memory adapter is used automatically (suitable for
   * local dev and single-process environments).
   */
  adapter?: MagicLinkAdapter;

  /** Consumer-provided email sender. Throwing here aborts the request. */
  sendEmail: (args: SendEmailArgs) => Promise<void> | void;

  /**
   * Absolute URL of the auth base path (no trailing slash), used to build
   * the magic-link consume URL. Example:
   *   `https://example.com/api/auth`
   * The plugin appends `/magic-link/consume?token=…`.
   */
  baseUrl: string;

  /** Default: `'magic-link'`. */
  mode?: MagicLinkMode;

  /** Default: `'primary'`. */
  role?: MagicLinkRole;

  /**
   * Controls which users the plugin will issue tokens for.
   * - `'login'`    — only existing users. Unknown emails → silent no-op.
   * - `'register'` — only new users. Known emails → silent no-op.
   *                  Registration is always enabled in this scope (overrides `allowRegistration`).
   * - `'both'`     — default; behaviour controlled by `allowRegistration`.
   */
  useFor?: MagicLinkUseFor;

  /** Token / OTP lifetime in seconds. Default: 600 (10 min). */
  tokenTtlSeconds?: number;

  /** OTP digit count (4–10). Default: 6. */
  otpLength?: number;

  /** Auto-create a user when the email is unknown. Default: true. Only applies when `useFor` is `'both'`. */
  allowRegistration?: boolean;

  /**
   * Optional override for auto-registration. Called instead of the default
   * `config.adapters.user.createUser` path. Useful when you want to set
   * additional fields (e.g. `name`, `image`) or enforce custom invariants.
   */
  onAutoRegister?: (email: string, ctx: PluginContext) => Promise<AdapterUser>;

  /**
   * If `true` (default), sets `emailVerified = now()` on the user record the first
   * time a magic-link token or OTP is successfully consumed. This treats the
   * consume/verify step as the proof-of-ownership and marks the address as verified.
   */
  markEmailVerified?: boolean;

  /**
   * If `true`, the `consume` and `verifyOtp` paths throw `MAGIC_LINK_EMAIL_NOT_VERIFIED`
   * (HTTP 403) when the resolved user still has `emailVerified === null` **after** the
   * `markEmailVerified` step has run.
   *
   * When `markEmailVerified` is `true` (default) this only fires for users whose address
   * was not verified via a magic-link — e.g. a password-registered user who hasn't
   * clicked their verification email yet.
   * Default: `false`.
   */
  blockLoginBeforeEmailVerification?: boolean;

  /**
   * Minimum seconds between two `request` calls for the same email+type pair.
   * Applies after a token has been consumed. While a valid (unexpired, unused)
   * token exists, `request()` is silently idempotent regardless of this setting.
   * Throws `MAGIC_LINK_RESEND_TOO_SOON` (HTTP 429) with `retryAfterSeconds`.
   * Default: 60.
   */
  resendCooldownSeconds?: number;

  /**
   * Rate limiter for the `/magic-link/request` and `/magic-link/resend` routes
   * (per email + per IP). Default: in-memory (5 attempts / 5 min).
   * For multi-instance deployments, supply a Redis-backed limiter.
   */
  requestLimiter?: MagicLinkRateLimiter;

  /**
   * Rate limiter for OTP verification (`/magic-link/verify-otp`).
   * Kept separate from `requestLimiter` to prevent an attacker from exhausting
   * a user's verify budget by spamming the request endpoint.
   * Default: in-memory (5 attempts / 5 min).
   */
  verifyLimiter?: MagicLinkRateLimiter;

  /** Pending-token TTL for secondFactor flow (seconds). Default: cfg.tokens.pendingTtl or 300. */
  pendingTtlSeconds?: number;

  /**
   * If set, the `GET /magic-link/consume` route returns a 302 redirect to this
   * path after a successful sign-in (e.g. `'/dashboard'`). When omitted, the
   * route returns a JSON body instead. Cookies are set in both cases.
   */
  successRedirect?: string;

  /**
   * If set, the `GET /magic-link/consume` route returns a 302 redirect here on
   * failure. `?error=<code>` is appended (e.g. `/magic-link?error=...`).
   * When omitted, the route returns a JSON error body.
   */
  errorRedirect?: string;

  /**
   * Separate redirect target specifically for expired tokens.
   * When set, an expired-token consume redirects here (e.g. `'/magic-link'`
   * so the user lands directly on the request-new-link page).
   * Falls back to `errorRedirect` if unset.
   */
  expiredRedirect?: string;
}

export interface MagicLinkApi {
  /** Send a magic link or OTP to the given email.
   *  Silently no-ops when registration is disabled and the email is unknown. */
  request(input: {
    email: string;
    /** Override `options.mode`. Ignored when mode is fixed (not `'both'`). */
    type?: MagicLinkTokenType;
    ip?: string;
    userAgent?: string;
  }): Promise<{ sent: boolean }>;

  /** Verify a magic-link token (from URL query). Issues a session. */
  consume(input: {
    token: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;

  /** Verify an OTP. Issues a session.  */
  verifyOtp(input: {
    email: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;
}

export interface MagicLinkPlugin extends HoleauthPlugin<typeof PLUGIN_ID, MagicLinkApi> {}

/* ───────────────────────── helpers ───────────────────────── */

function rateLimitedError(retryAfterSeconds?: number): HoleauthError {
  const err = new HoleauthError(
    'MAGIC_LINK_RATE_LIMITED',
    'too many magic-link attempts, try again later',
    429,
  );
  if (retryAfterSeconds) {
    Object.defineProperty(err, 'retryAfterSeconds', {
      value: retryAfterSeconds,
      enumerable: true,
    });
  }
  return err;
}

function sanitizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'email must be a string', 400);
  }
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > MAX_EMAIL_LENGTH || !v.includes('@')) {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'email has invalid format', 400);
  }
  return v;
}

function sanitizeToken(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'token must be a string', 400);
  }
  if (raw.length === 0 || raw.length > MAX_TOKEN_LENGTH) {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'token has invalid length', 400);
  }
  return raw;
}

function sanitizeOtp(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'code must be a string', 400);
  }
  const v = raw.trim();
  if (v.length === 0 || v.length > MAX_OTP_LENGTH || !/^\d+$/.test(v)) {
    throw new HoleauthError('MAGIC_LINK_INVALID_INPUT', 'code has invalid format', 400);
  }
  return v;
}

async function guardRate(
  limiter: MagicLinkRateLimiter | undefined,
  key: string,
): Promise<void> {
  if (!limiter) return;
  const res = await limiter.check(key);
  if (!res.ok) throw rateLimitedError(res.retryAfterSeconds);
}

function holeauthErrorExtra(err: HoleauthError): Record<string, unknown> {
  const extra: Record<string, unknown> = { message: err.message };
  if ('retryAfterSeconds' in (err as object)) {
    extra.retryAfterSeconds = (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
  }
  return extra;
}

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: { code, ...(extra ?? {}) } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function redirectWithError(target: string, code: string): Response {
  const sep = target.includes('?') ? '&' : '?';
  const location = `${target}${sep}error=${encodeURIComponent(code)}`;
  return new Response(null, { status: 302, headers: { location } });
}

function resolveType(mode: MagicLinkMode, requested?: MagicLinkTokenType): MagicLinkTokenType {
  if (mode === 'magic-link') return 'magic-link';
  if (mode === 'otp') return 'otp';
  // mode === 'both' → caller chooses, default magic-link.
  return requested ?? 'magic-link';
}

function buildConsumeUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/magic-link/consume?token=${encodeURIComponent(token)}`;
}

/* ───────────────────────── plugin ───────────────────────── */

export function magicLink(options: MagicLinkOptions): MagicLinkPlugin {
  // Validate baseUrl eagerly so misconfiguration surfaces at startup.
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(options.baseUrl);
  } catch {
    throw new Error(
      '@holeauth/plugin-magic-link: `baseUrl` must be a valid absolute URL (e.g. https://example.com/api/auth)',
    );
  }
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('@holeauth/plugin-magic-link: `baseUrl` must use http or https protocol');
  }
  const secureCookies = parsedBaseUrl.protocol === 'https:';

  const adapter = options.adapter ?? createMemoryAdapter();
  const mode: MagicLinkMode = options.mode ?? 'magic-link';
  const role: MagicLinkRole = options.role ?? 'primary';
  const useFor: MagicLinkUseFor = options.useFor ?? 'both';
  const ttl = options.tokenTtlSeconds ?? 600;
  const otpLength = options.otpLength ?? 6;
  const allowRegistration = options.allowRegistration ?? true;
  const markEmailVerified = options.markEmailVerified ?? true;
  const blockLoginBeforeEmailVerification = options.blockLoginBeforeEmailVerification ?? false;
  const resendCooldownSeconds = options.resendCooldownSeconds ?? 60;
  const requestLimiter = options.requestLimiter ?? createMemoryRateLimiter();
  const verifyLimiter = options.verifyLimiter ?? createMemoryRateLimiter();

  // Logged once per plugin instance when a request arrives without an IP.
  let ipWarnLogged = false;

  if (otpLength < 4 || otpLength > 10) {
    throw new Error('@holeauth/plugin-magic-link: `otpLength` must be 4–10');
  }

  /** Resolve the user for a `request()` call, respecting `useFor` scope.
   *  Returns the user to issue a token for, or null for a silent no-op. */
  async function resolveUserForRequest(email: string, ctx: PluginContext): Promise<AdapterUser | null> {
    const existing = await ctx.core.getUserByEmail(email);

    if (useFor === 'login') {
      // Only serve existing users — unknown emails silently ignored.
      return existing ?? null;
    }

    if (useFor === 'register') {
      // Only serve new users — existing emails silently ignored.
      if (existing) return null;
      // Registration is always enabled in this scope.
      if (options.onAutoRegister) return options.onAutoRegister(email, ctx);
      return ctx.config.adapters.user.createUser({
        email,
        name: null,
        image: null,
        emailVerified: null,
        passwordHash: null,
      });
    }

    // useFor === 'both'
    if (existing) return existing;
    if (!allowRegistration) return null;
    if (options.onAutoRegister) return options.onAutoRegister(email, ctx);
    return ctx.config.adapters.user.createUser({
      email,
      name: null,
      image: null,
      emailVerified: null,
      passwordHash: null,
    });
  }

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter,

    hooks: {
      signIn: {
        async challenge(user, _input, ctx): Promise<ChallengeResult | null> {
          if (role !== 'secondFactor') return null;
          // Issue + send a fresh code, then halt the sign-in with a pending token.
          const api = ctx.getPlugin<MagicLinkApi>(PLUGIN_ID);
          // Reuse the request path so adapter writes + email are consistent.
          // `type` defaults via resolveType(mode).
          await api.request({ email: user.email });
          const { token, expiresAt } = await issuePendingToken(ctx.config, {
            userId: user.id,
            pluginId: PLUGIN_ID,
            ttlSeconds: options.pendingTtlSeconds,
          });
          return { pluginId: PLUGIN_ID, pendingToken: token, expiresAt };
        },
      },
      userDelete: {
        async after({ userId }, ctx) {
          try {
            await adapter.deleteByUserId(userId);
          } catch (err) {
            ctx.logger.error(
              'magic-link: failed to purge tokens on user delete',
              err,
            );
          }
        },
      },
    },

    routes: [
      {
        method: 'POST',
        path: '/magic-link/request',
        // No CSRF — caller has no session yet, so no double-submit cookie exists.
        // Brute-force / spam is mitigated via rate-limiting on email + IP.
        async handler(rctx) {
          const api = rctx.plugin.getPlugin<MagicLinkApi>(PLUGIN_ID);
          const email = sanitizeEmail(rctx.body.email);
          const requestedType =
            typeof rctx.body.type === 'string'
              ? (rctx.body.type as MagicLinkTokenType)
              : undefined;
          try {
            await api.request({
              email,
              type: requestedType,
              ip: rctx.meta.ip,
              userAgent: rctx.meta.userAgent,
            });
          } catch (err) {
            if (err instanceof HoleauthError) {
              return jsonError(err.code, err.status, holeauthErrorExtra(err));
            }
            throw err;
          }
          // Never expose `sent` — returning it would leak whether the email
          // exists in the system (enumeration).
          return jsonOk({});
        },
      },
      {
        method: 'POST',
        path: '/magic-link/verify-otp',
        // No CSRF — same reasoning as /magic-link/request.
        async handler(rctx) {
          const api = rctx.plugin.getPlugin<MagicLinkApi>(PLUGIN_ID);
          const email = sanitizeEmail(rctx.body.email);
          const code = sanitizeOtp(rctx.body.code);
          let verifyResult: { user: AdapterUser; tokens: IssuedTokens };
          try {
            verifyResult = await api.verifyOtp({
              email,
              code,
              ip: rctx.meta.ip,
              userAgent: rctx.meta.userAgent,
            });
          } catch (err) {
            if (err instanceof HoleauthError) {
              return jsonError(err.code, err.status, holeauthErrorExtra(err));
            }
            throw err;
          }
          const { user, tokens } = verifyResult;
          setSessionCookies(rctx, tokens, secureCookies);
          return new Response(
            JSON.stringify({
              ok: true,
              user: { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null },
              csrfToken: tokens.csrfToken,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        },
      },
      {
        method: 'GET',
        path: '/magic-link/consume',
        async handler(rctx) {
          const api = rctx.plugin.getPlugin<MagicLinkApi>(PLUGIN_ID);
          const url = new URL(rctx.req.url);
          const token = url.searchParams.get('token');
          if (!token) {
            return options.errorRedirect
              ? redirectWithError(options.errorRedirect, 'MAGIC_LINK_MISSING_TOKEN')
              : jsonError('MAGIC_LINK_MISSING_TOKEN', 400);
          }
          let result: { user: AdapterUser; tokens: IssuedTokens };
          try {
            result = await api.consume({
              token,
              ip: rctx.meta.ip,
              userAgent: rctx.meta.userAgent,
            });
          } catch (err) {
            if (err instanceof HoleauthError) {
              // Expired tokens get their own redirect target so the user lands
              // directly on the "request a new link" page.
              const isExpired = err.code === 'MAGIC_LINK_EXPIRED';
              const target = isExpired
                ? (options.expiredRedirect ?? options.errorRedirect)
                : options.errorRedirect;
              return target
                ? redirectWithError(target, err.code)
                : jsonError(err.code, err.status, { message: err.message });
            }
            throw err;
          }
          setSessionCookies(rctx, result.tokens, secureCookies);
          if (options.successRedirect) {
            // The dispatcher merges queued Set-Cookie headers into this response.
            return new Response(null, {
              status: 302,
              headers: { location: options.successRedirect },
            });
          }
          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name ?? null,
                image: result.user.image ?? null,
              },
              csrfToken: result.tokens.csrfToken,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        },
      },
      {
        method: 'POST',
        path: '/magic-link/resend',
        // No CSRF — same reasoning as POST /magic-link/request.
        // Rate-limiting and cooldown are enforced inside api.request().
        async handler(rctx) {
          const api = rctx.plugin.getPlugin<MagicLinkApi>(PLUGIN_ID);
          const rawEmail = rctx.body.email ?? rctx.body.identifier;
          const rawType = typeof rctx.body.type === 'string' ? rctx.body.type : undefined;
          let email: string;
          try {
            email = sanitizeEmail(rawEmail);
          } catch {
            return jsonError('MAGIC_LINK_INVALID_INPUT', 400, { message: 'email query parameter is required' });
          }
          const requestedType =
            rawType === 'otp' || rawType === 'magic-link'
              ? (rawType as MagicLinkTokenType)
              : undefined;
          try {
            await api.request({
              email,
              type: requestedType,
              ip: rctx.meta.ip,
              userAgent: rctx.meta.userAgent,
            });
          } catch (err) {
            if (err instanceof HoleauthError) {
              return jsonError(err.code, err.status, holeauthErrorExtra(err));
            }
            throw err;
          }
          // Never expose `sent` — same enumeration protection as /request.
          return jsonOk({});
        },
      },
    ],

    api(ctx: PluginContext): MagicLinkApi {
      return {
        async request(input) {
          const email = sanitizeEmail(input.email);
          const type = resolveType(mode, input.type);
          if (type === 'otp' && mode === 'magic-link') {
            throw new HoleauthError('MAGIC_LINK_MODE_MISMATCH', 'otp not enabled', 400);
          }
          if (type === 'magic-link' && mode === 'otp') {
            throw new HoleauthError('MAGIC_LINK_MODE_MISMATCH', 'magic-link not enabled', 400);
          }

          // Rate-limit per email AND (best-effort) per IP.
          await guardRate(requestLimiter, `request:email:${email}`);
          if (input.ip) {
            await guardRate(requestLimiter, `request:ip:${input.ip}`);
          } else if (!ipWarnLogged) {
            ipWarnLogged = true;
            ctx.logger.warn(
              'magic-link: no IP provided for rate-limiting — per-IP limit is inactive. ' +
              'Ensure your framework adapter populates rctx.meta.ip.',
            );
          }

          const user = await resolveUserForRequest(email, ctx);
          if (!user) {
            // Silent no-op — same response shape as success to avoid enumeration.
            return { sent: false };
          }

          // Idempotency: if a valid (unexpired, unconsumed) token already exists
          // for this email+type, skip creating a new one and skip sendEmail.
          // This prevents duplicate emails when the user clicks a resend button
          // multiple times before the first link expires, and ensures the GET
          // /consume endpoint is safe to retry (no new email fired).
          const existingToken = await adapter.findActiveToken(email, type);
          if (existingToken) {
            return { sent: false };
          }

          // Resend cooldown: prevent rapid-fire re-requests AFTER a token was
          // consumed. Fires only when no valid token exists (idempotency above).
          if (resendCooldownSeconds > 0) {
            const latest = await adapter.findLatestByIdentifier(email, type);
            if (latest) {
              const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
              if (elapsed < resendCooldownSeconds) {
                const retryAfterSeconds = Math.ceil(resendCooldownSeconds - elapsed);
                const err = new HoleauthError(
                  'MAGIC_LINK_RESEND_TOO_SOON',
                  'please wait before requesting another link',
                  429,
                );
                Object.defineProperty(err, 'retryAfterSeconds', {
                  value: retryAfterSeconds,
                  enumerable: true,
                });
                throw err;
              }
            }
          }

          // Invalidate prior tokens of the same kind so a fresh request
          // supersedes the old code/link.
          await adapter.deleteByIdentifier(email, type);

          const plaintext = type === 'otp' ? generateOtp(otpLength) : generateMagicToken(32);
          const tokenHash = await hashToken(plaintext);
          const expiresAt = new Date(Date.now() + ttl * 1000);
          await adapter.createToken({
            identifier: email,
            tokenHash,
            type,
            userId: user.id,
            expiresAt,
          });

          await options.sendEmail({
            email,
            type,
            url: type === 'magic-link' ? buildConsumeUrl(options.baseUrl, plaintext) : undefined,
            code: type === 'otp' ? plaintext : undefined,
            expiresAt: expiresAt.getTime(),
          });

          await ctx.events.emit({
            type: 'magicLink.requested',
            userId: user.id,
            sessionId: null,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            data: { type, identifier: email },
          });

          return { sent: true };
        },

        async consume(input) {
          const token = sanitizeToken(input.token);
          const tokenHash = await hashToken(token);

          // Atomic consume — prevents double-session via concurrent requests.
          // Returns the record if it was consumed successfully, null otherwise.
          const consumed = await adapter.atomicConsumeByHash(tokenHash);
          if (!consumed) {
            // Determine the specific error for UX (expired redirect, etc.).
            const existing = await adapter.findByTokenHash(tokenHash);
            if (!existing) throw new CredentialsError('magic link token invalid');
            if (existing.type !== 'magic-link') throw new CredentialsError('magic link token invalid');
            if (existing.usedAt) throw new HoleauthError('MAGIC_LINK_USED', 'token already used', 400);
            throw new HoleauthError('MAGIC_LINK_EXPIRED', 'token expired', 400);
          }

          let user = await resolveUserFromRecord(consumed, ctx);
          user = await applyEmailVerificationRules(user, ctx);

          const result = await ctx.core.completeSignIn(user.id, {
            method: 'magic-link',
            ip: input.ip,
            userAgent: input.userAgent,
          });

          await ctx.events.emit({
            type: 'magicLink.consumed',
            userId: user.id,
            sessionId: result.tokens.sessionId,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            data: { type: 'magic-link' },
          });

          return result;
        },

        async verifyOtp(input) {
          const email = sanitizeEmail(input.email);
          const code = sanitizeOtp(input.code);
          await guardRate(verifyLimiter, `verify:otp:${email}`);

          const record = await adapter.findActiveToken(email, 'otp');
          // Unified error — don't reveal whether the code or the email is wrong.
          if (!record) throw new CredentialsError('invalid OTP code');

          const codeHash = await hashToken(code);
          if (!constantTimeEquals(codeHash, record.tokenHash)) {
            throw new CredentialsError('invalid OTP code');
          }

          // Atomic consume — returns null if a concurrent request already consumed
          // this OTP (race condition: two parallel verify calls with the same code).
          const consumed = await adapter.atomicConsumeById(record.id);
          if (!consumed) {
            throw new HoleauthError('MAGIC_LINK_USED', 'OTP already used', 400);
          }

          await verifyLimiter.reset(`verify:otp:${email}`);

          let user = await resolveUserFromRecord(consumed, ctx);
          user = await applyEmailVerificationRules(user, ctx);

          const result = await ctx.core.completeSignIn(user.id, {
            method: 'magic-link-otp',
            ip: input.ip,
            userAgent: input.userAgent,
          });

          await ctx.events.emit({
            type: 'magicLink.otp_verified',
            userId: user.id,
            sessionId: result.tokens.sessionId,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            data: { type: 'otp' },
          });

          return result;
        },
      };

      async function resolveUserFromRecord(
        record: MagicLinkRecord,
        c: PluginContext,
      ): Promise<AdapterUser> {
        if (record.userId) {
          const u = await c.core.getUserById(record.userId);
          if (u) return u;
        }
        // Fallback: re-resolve by email (covers edge cases where userId was not
        // stored on the token record).
        const u = await c.core.getUserByEmail(record.identifier);
        if (u) return u;
        // Last resort: create. Only reachable in 'both' / 'register' scopes.
        if (useFor === 'login') {
          throw new HoleauthError('MAGIC_LINK_USER_NOT_FOUND', 'user not found', 404);
        }
        return options.onAutoRegister
          ? options.onAutoRegister(record.identifier, c)
          : c.config.adapters.user.createUser({
              email: record.identifier,
              name: null,
              image: null,
              emailVerified: null,
              passwordHash: null,
            });
      }

      /**
       * After resolving the user from a consumed token:
       * 1. If `markEmailVerified` is true and emailVerified is null → set it now.
       * 2. If `blockLoginBeforeEmailVerification` is true and emailVerified is
       *    still null after step 1 → throw MAGIC_LINK_EMAIL_NOT_VERIFIED.
       */
      async function applyEmailVerificationRules(
        user: AdapterUser,
        c: PluginContext,
      ): Promise<AdapterUser> {
        let current = user;

        // Step 1 — mark verified (magic-link proves ownership)
        if (markEmailVerified && current.emailVerified === null) {
          current = await c.config.adapters.user.updateUser(current.id, {
            emailVerified: new Date(),
          });
        }

        // Step 2 — block if still unverified
        if (blockLoginBeforeEmailVerification && current.emailVerified === null) {
          throw new HoleauthError(
            'MAGIC_LINK_EMAIL_NOT_VERIFIED',
            'email address must be verified before sign-in',
            403,
          );
        }

        return current;
      }
    },
  });
}

function setSessionCookies(
  rctx: {
    plugin: PluginContext;
    setCookie: (spec: { name: string; value: string; maxAge?: number; httpOnly?: boolean; path?: string; secure?: boolean }) => void;
  },
  tokens: IssuedTokens,
  secure: boolean,
): void {
  const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
  const accessTtl = rctx.plugin.config.tokens?.accessTtl ?? 900;
  const refreshTtl = rctx.plugin.config.tokens?.refreshTtl ?? 2592000;
  rctx.setCookie({ name: `${prefix}.at`, value: tokens.accessToken, maxAge: accessTtl, httpOnly: true, path: '/', secure });
  rctx.setCookie({ name: `${prefix}.rt`, value: tokens.refreshToken, maxAge: refreshTtl, httpOnly: true, path: '/', secure });
  rctx.setCookie({ name: `${prefix}.csrf`, value: tokens.csrfToken, maxAge: refreshTtl, httpOnly: false, path: '/', secure });
  rctx.setCookie({ name: `${prefix}.pending`, value: '', maxAge: 0, httpOnly: true, path: '/', secure });
}
