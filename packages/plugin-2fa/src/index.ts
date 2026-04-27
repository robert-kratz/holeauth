import {
  definePlugin,
  type PluginContext,
  type ChallengeResult,
  type HoleauthPlugin,
} from '@holeauth/core';
import type { AdapterUser } from '@holeauth/core/adapters';
import type { IssuedTokens } from '@holeauth/core';
import { HoleauthError, CredentialsError } from '@holeauth/core/errors';
import { issuePendingToken, verifyPendingToken } from '@holeauth/core/flows';
import type { TwoFactorAdapter, TwoFactorRecord } from './adapter.js';
import { buildOtpauthUrl, generateSecret, verifyTotp } from './totp.js';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from './recovery.js';
import { renderQrBuffer, renderQrDataUrl } from './qrcode.js';
import {
  createMemoryRateLimiter,
  type TwoFactorRateLimiter,
} from './rate-limit.js';

export type { TwoFactorAdapter, TwoFactorRecord } from './adapter.js';
export {
  generateRecoveryCodes,
  formatRecoveryCodesAsText,
  recoveryCodesToBlob,
  downloadRecoveryCodesAsTxt,
  constantTimeEquals,
  consumeRecoveryCode,
  normalizeRecoveryCode,
  type RecoveryCodesTxtOptions,
  type DownloadRecoveryCodesOptions,
} from './recovery.js';
export { verifyTotp, buildOtpauthUrl, generateSecret } from './totp.js';
export { renderQrBuffer, renderQrDataUrl } from './qrcode.js';
export {
  createMemoryRateLimiter,
  type TwoFactorRateLimiter,
  type MemoryRateLimiterOptions,
} from './rate-limit.js';

const PLUGIN_ID = 'twofa' as const;

/** Max accepted code length (TOTP 6 digits + optional whitespace or 14-char
 *  recovery formatted as `XXXX-XXXX-XXXX`). Anything longer is rejected
 *  unconditionally to avoid DoS via pathological input. */
const MAX_CODE_LENGTH = 64;

/** Re-thrown by `verify()` / `activate()` / `disable()` when the rate limiter bucket is exhausted. */
export function twoFactorRateLimitedError(retryAfterSeconds?: number): HoleauthError {
  const err = new HoleauthError(
    'TWOFA_RATE_LIMITED',
    'too many 2FA attempts, try again later',
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

export interface TwoFactorOptions {
  adapter: TwoFactorAdapter;
  /** Issuer shown in authenticator apps. Default: 'holeauth'. */
  issuer?: string;
  /** Recovery code count. Default: 10. */
  recoveryCodeCount?: number;
  /** Pending challenge TTL (seconds). Default: config.tokens.pendingTtl or 300. */
  pendingTtlSeconds?: number;
  /**
   * Rate limiter consulted before `verify`, `activate` and `disable`.
   * Defaults to an in-process memory limiter (5 attempts / 5 min).
   * Supply a distributed implementation in production.
   */
  rateLimiter?: TwoFactorRateLimiter;
}

export interface TwoFactorApi {
  /** Begin enrollment — generates (and persists) a secret, returns the otpauth URL
   *  plus a ready-to-render PNG data URL of the QR code. */
  setup(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>;
  /** Render any `otpauth://…` URI (or arbitrary payload) as a PNG data URL
   *  suitable for `<img src>`. */
  renderQrDataUrl(payload: string): Promise<string>;
  /** Render any `otpauth://…` URI as a raw PNG buffer (for serving via a route). */
  renderQrBuffer(payload: string): Promise<Buffer>;
  /** Finalise enrollment by verifying a live code; returns recovery codes once. */
  activate(userId: string, code: string): Promise<{ recoveryCodes: string[] }>;
  /** Verify a code (TOTP or recovery) while in pending state, returning the
   *  core-issued session tokens. */
  verify(input: {
    pendingToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;
  /** Remove 2FA for the user. Requires a valid current code. */
  disable(userId: string, code: string): Promise<void>;
  /** Convenience check. */
  isEnabled(userId: string): Promise<boolean>;
}

export interface TwoFactorPlugin
  extends HoleauthPlugin<typeof PLUGIN_ID, TwoFactorApi> {}

async function requireRecord(
  adapter: TwoFactorAdapter,
  userId: string,
): Promise<TwoFactorRecord> {
  const r = await adapter.getByUserId(userId);
  if (!r) throw new HoleauthError('TWOFA_NOT_ENROLLED', '2FA not enrolled', 400);
  return r;
}

/** Validate + narrow a string code coming from untrusted input. Throws a
 *  typed error if the shape is obviously wrong — callers do not have to
 *  duplicate this check. */
function sanitizeCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HoleauthError('TWOFA_INVALID_INPUT', '2FA code must be a string', 400);
  }
  if (raw.length === 0 || raw.length > MAX_CODE_LENGTH) {
    throw new HoleauthError('TWOFA_INVALID_INPUT', '2FA code has invalid length', 400);
  }
  return raw;
}

async function guardRate(
  limiter: TwoFactorRateLimiter | undefined,
  key: string,
): Promise<void> {
  if (!limiter) return;
  const res = await limiter.check(key);
  if (!res.ok) {
    throw twoFactorRateLimitedError(res.retryAfterSeconds);
  }
}

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: { code, ...(extra ?? {}) } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function twofa(options: TwoFactorOptions): TwoFactorPlugin {
  const issuer = options.issuer ?? 'holeauth';
  const adapter = options.adapter;
  const recoveryCount = options.recoveryCodeCount ?? 10;
  const rateLimiter = options.rateLimiter ?? createMemoryRateLimiter();

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter,

    hooks: {
      signIn: {
        async challenge(user, _input, ctx): Promise<ChallengeResult | null> {
          const record = await adapter.getByUserId(user.id);
          if (!record?.enabled) return null;
          const { token, expiresAt } = await issuePendingToken(ctx.config, {
            userId: user.id,
            pluginId: PLUGIN_ID,
            ttlSeconds: options.pendingTtlSeconds,
          });
          return {
            pluginId: PLUGIN_ID,
            pendingToken: token,
            expiresAt,
          };
        },
      },
      userDelete: {
        async after({ userId }, ctx) {
          try {
            await adapter.delete(userId);
          } catch (err) {
            ctx.logger.error('twofa: failed to purge 2FA record on user delete', err);
          }
        },
      },
    },

    routes: [
      {
        method: 'POST',
        path: '/2fa/setup',
        requireAuth: true,
        requireCsrf: true,
        async handler(rctx) {
          const session = await rctx.getSession();
          if (!session) return jsonError('UNAUTHENTICATED', 401);
          const api = rctx.plugin.getPlugin<TwoFactorApi>(PLUGIN_ID);
          const out = await api.setup(session.userId);
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
      {
        method: 'POST',
        path: '/2fa/activate',
        requireAuth: true,
        requireCsrf: true,
        async handler(rctx) {
          const session = await rctx.getSession();
          if (!session) return jsonError('UNAUTHENTICATED', 401);
          const api = rctx.plugin.getPlugin<TwoFactorApi>(PLUGIN_ID);
          const out = await api.activate(session.userId, sanitizeCode(rctx.body.code));
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
      {
        method: 'POST',
        path: '/2fa/verify',
        async handler(rctx) {
          const pending = rctx.cookies.get(
            `${rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth'}.pending`,
          );
          if (!pending) return jsonError('NO_PENDING', 400);
          const api = rctx.plugin.getPlugin<TwoFactorApi>(PLUGIN_ID);
          const { user, tokens } = await api.verify({
            pendingToken: pending,
            code: sanitizeCode(rctx.body.code),
            ip: rctx.meta.ip,
            userAgent: rctx.meta.userAgent,
          });
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const accessTtl = rctx.plugin.config.tokens?.accessTtl ?? 900;
          const refreshTtl = rctx.plugin.config.tokens?.refreshTtl ?? 2592000;
          rctx.setCookie({ name: `${prefix}.at`, value: tokens.accessToken, maxAge: accessTtl, httpOnly: true, path: '/' });
          rctx.setCookie({ name: `${prefix}.rt`, value: tokens.refreshToken, maxAge: refreshTtl, httpOnly: true, path: '/api/auth' });
          rctx.setCookie({ name: `${prefix}.csrf`, value: tokens.csrfToken, maxAge: refreshTtl, httpOnly: false, path: '/' });
          rctx.setCookie({ name: `${prefix}.pending`, value: '', maxAge: 0, httpOnly: true, path: '/' });
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
        method: 'POST',
        path: '/2fa/disable',
        requireAuth: true,
        requireCsrf: true,
        async handler(rctx) {
          const session = await rctx.getSession();
          if (!session) return jsonError('UNAUTHENTICATED', 401);
          const api = rctx.plugin.getPlugin<TwoFactorApi>(PLUGIN_ID);
          await api.disable(session.userId, sanitizeCode(rctx.body.code));
          return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
    ],

    api(ctx: PluginContext): TwoFactorApi {
      return {
        async isEnabled(userId) {
          const r = await adapter.getByUserId(userId);
          return !!r?.enabled;
        },

        async setup(userId) {
          const user = await ctx.core.getUserById(userId);
          if (!user) throw new HoleauthError('NOT_FOUND', 'user not found', 404);
          const existing = await adapter.getByUserId(userId);
          if (existing?.enabled) {
            throw new HoleauthError('TWOFA_ALREADY_ENABLED', '2FA already enabled', 409);
          }
          const secret = generateSecret();
          await adapter.upsert({
            userId,
            secret,
            enabled: false,
            recoveryCodes: [],
          });
          const otpauthUrl = buildOtpauthUrl({
            secret,
            issuer,
            label: user.email,
          });
          const qrCodeDataUrl = await renderQrDataUrl(otpauthUrl);
          return { secret, otpauthUrl, qrCodeDataUrl };
        },

        renderQrDataUrl(payload) {
          return renderQrDataUrl(payload);
        },

        renderQrBuffer(payload) {
          return renderQrBuffer(payload);
        },

        async activate(userId, code) {
          const r = await requireRecord(adapter, userId);
          if (r.enabled) {
            throw new HoleauthError('TWOFA_ALREADY_ENABLED', '2FA already enabled', 409);
          }
          await guardRate(rateLimiter, `activate:${userId}`);
          if (!verifyTotp(r.secret, code)) throw new CredentialsError('invalid 2FA code');
          await rateLimiter.reset(`activate:${userId}`);
          const recoveryCodes = generateRecoveryCodes(recoveryCount);
          await adapter.update(userId, {
            enabled: true,
            recoveryCodes,
            updatedAt: new Date(),
          });
          return { recoveryCodes };
        },

        async verify(input) {
          const { userId } = await verifyPendingToken(ctx.config, input.pendingToken, PLUGIN_ID);
          const r = await requireRecord(adapter, userId);
          if (!r.enabled) throw new CredentialsError('2FA not enabled');
          await guardRate(rateLimiter, `verify:${userId}`);

          let ok = verifyTotp(r.secret, input.code);
          if (!ok) {
            const cleaned = normalizeRecoveryCode(input.code);
            const next = consumeRecoveryCode(r.recoveryCodes, cleaned);
            if (next) {
              await adapter.update(userId, { recoveryCodes: next, updatedAt: new Date() });
              ok = true;
            }
          }
          if (!ok) throw new CredentialsError('invalid 2FA code');
          await rateLimiter.reset(`verify:${userId}`);

          return ctx.core.completeSignIn(userId, {
            method: 'totp',
            ip: input.ip,
            userAgent: input.userAgent,
          });
        },

        async disable(userId, code) {
          const r = await requireRecord(adapter, userId);
          await guardRate(rateLimiter, `disable:${userId}`);
          if (!verifyTotp(r.secret, code)) throw new CredentialsError('invalid 2FA code');
          await rateLimiter.reset(`disable:${userId}`);
          await adapter.delete(userId);
        },
      };
    },
  });
}
