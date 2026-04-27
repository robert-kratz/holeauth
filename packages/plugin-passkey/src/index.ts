/**
 * @holeauth/plugin-passkey
 *
 * WebAuthn / Passkey authentication as a holeauth plugin.
 *
 * Uses @simplewebauthn/server under the hood. The consumer application
 * is responsible for the browser-side ceremony (via @simplewebauthn/browser)
 * and posting the response JSON to the plugin-mounted routes.
 */
import {
  definePlugin,
  type PluginContext,
  type HoleauthPlugin,
} from '@holeauth/core';
import type { AdapterUser } from '@holeauth/core/adapters';
import type { IssuedTokens } from '@holeauth/core';
import { HoleauthError } from '@holeauth/core/errors';
import type { PasskeyAdapter, PasskeyRecord } from './adapter.js';
import {
  createMemoryRateLimiter,
  type PasskeyRateLimiter,
} from './rate-limit.js';

export type { PasskeyAdapter, PasskeyRecord } from './adapter.js';
export {
  createMemoryRateLimiter,
  type PasskeyRateLimiter,
  type MemoryRateLimiterOptions,
} from './rate-limit.js';

const PLUGIN_ID = 'passkey' as const;

/** Hard upper bound on any untrusted string field (device name, credential id). */
const MAX_STRING_LENGTH = 512;

/** Raised when an attacker burns through the login verify limiter. */
export function passkeyRateLimitedError(retryAfterSeconds?: number): HoleauthError {
  const err = new HoleauthError(
    'PASSKEY_RATE_LIMITED',
    'too many passkey attempts, try again later',
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

type WebAuthnModule = typeof import('@simplewebauthn/server');

async function loadWebAuthn(): Promise<WebAuthnModule> {
  try {
    return await import('@simplewebauthn/server');
  } catch {
    throw new HoleauthError(
      'PASSKEY_NOT_CONFIGURED',
      '@simplewebauthn/server is not installed',
      500,
    );
  }
}

function b64urlToBuffer(s: string): Uint8Array {
  const pad = 4 - (s.length % 4);
  const padded = pad === 4 ? s : s + '='.repeat(pad);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufferToB64url(b: Uint8Array | ArrayBuffer): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Narrow an untrusted string input and cap its length. */
function sanitizeString(raw: unknown, field: string, { optional = false } = {}): string {
  if (raw === undefined || raw === null) {
    if (optional) return '';
    throw new HoleauthError('PASSKEY_INVALID_INPUT', `${field} is required`, 400);
  }
  if (typeof raw !== 'string') {
    throw new HoleauthError('PASSKEY_INVALID_INPUT', `${field} must be a string`, 400);
  }
  if (raw.length === 0) {
    if (optional) return '';
    throw new HoleauthError('PASSKEY_INVALID_INPUT', `${field} cannot be empty`, 400);
  }
  if (raw.length > MAX_STRING_LENGTH) {
    throw new HoleauthError('PASSKEY_INVALID_INPUT', `${field} exceeds maximum length`, 400);
  }
  return raw;
}

async function guardRate(
  limiter: PasskeyRateLimiter | undefined,
  key: string,
): Promise<void> {
  if (!limiter) return;
  const res = await limiter.check(key);
  if (!res.ok) throw passkeyRateLimitedError(res.retryAfterSeconds);
}

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: { code, ...(extra ?? {}) } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface PasskeyOptions {
  adapter: PasskeyAdapter;
  /** Relying party id (domain, no protocol). */
  rpID: string;
  /** Full origin for the browser (e.g. 'https://app.example.com'). */
  rpOrigin: string;
  /** Relying party display name. */
  rpName?: string;
  /** Pending challenge TTL (seconds). Default: config.tokens.pendingTtl or 300. */
  pendingTtlSeconds?: number;
  /**
   * Rate limiter consulted before every `loginVerify` attempt. Defaults to
   * an in-process memory limiter (10 attempts per 5 min). Supply a
   * distributed implementation in production.
   */
  rateLimiter?: PasskeyRateLimiter;
}

export interface PasskeyApi {
  registerOptions(userId: string): Promise<{ options: unknown; challenge: string }>;
  registerVerify(
    userId: string,
    input: { response: unknown; expectedChallenge: string; deviceName?: string },
  ): Promise<{ credentialId: string }>;
  loginOptions(userId?: string): Promise<{ options: unknown; challenge: string }>;
  loginVerify(input: {
    response: unknown;
    expectedChallenge: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;
  list(userId: string): Promise<PasskeyRecord[]>;
  delete(userId: string, credentialId: string): Promise<void>;
}

export interface PasskeyPlugin extends HoleauthPlugin<typeof PLUGIN_ID, PasskeyApi> {}

export function passkey(options: PasskeyOptions): PasskeyPlugin {
  const { adapter, rpID, rpOrigin, rpName = 'holeauth' } = options;
  const rateLimiter = options.rateLimiter ?? createMemoryRateLimiter();

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter,

    hooks: {
      userDelete: {
        async after({ userId }, ctx) {
          try {
            const creds = await adapter.list(userId);
            for (const c of creds) {
              try {
                await adapter.delete(c.id);
              } catch (err) {
                ctx.logger.error(
                  'passkey: failed to delete credential during userDelete cleanup',
                  { err, userId, credentialId: c.id },
                );
              }
            }
          } catch (err) {
            ctx.logger.error(
              'passkey: failed to list credentials during userDelete cleanup',
              { err, userId },
            );
          }
        },
      },
    },

    routes: [
      {
        method: 'POST', path: '/passkey/register/options',
        requireAuth: true, requireCsrf: true,
        async handler(rctx) {
          const s = await rctx.getSession();
          if (!s) return jsonError('UNAUTHENTICATED', 401);
          const api = rctx.plugin.getPlugin<PasskeyApi>(PLUGIN_ID);
          const { options, challenge } = await api.registerOptions(s.userId);
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          rctx.setCookie({ name: `${prefix}.passkey.challenge`, value: challenge, maxAge: 300, httpOnly: true, path: '/' });
          return new Response(JSON.stringify({ options }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
      {
        method: 'POST', path: '/passkey/register/verify',
        requireAuth: true, requireCsrf: true,
        async handler(rctx) {
          const s = await rctx.getSession();
          if (!s) return jsonError('UNAUTHENTICATED', 401);
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const challenge = rctx.cookies.get(`${prefix}.passkey.challenge`);
          if (!challenge) return jsonError('NO_CHALLENGE', 400);
          const api = rctx.plugin.getPlugin<PasskeyApi>(PLUGIN_ID);
          const out = await api.registerVerify(s.userId, {
            response: rctx.body.response,
            expectedChallenge: challenge,
            deviceName: rctx.body.deviceName ? sanitizeString(rctx.body.deviceName, 'deviceName', { optional: true }) : undefined,
          });
          rctx.setCookie({ name: `${prefix}.passkey.challenge`, value: '', maxAge: 0, httpOnly: true, path: '/' });
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
      {
        method: 'POST', path: '/passkey/login/options',
        async handler(rctx) {
          const api = rctx.plugin.getPlugin<PasskeyApi>(PLUGIN_ID);
          // Do NOT forward an explicit userId to the API — this prevents a
          // trivial user-enumeration oracle based on whether `allowCredentials`
          // is empty vs populated. Discoverable credentials (passkey UI) pick
          // the right credential at ceremony time.
          const { options, challenge } = await api.loginOptions();
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          rctx.setCookie({ name: `${prefix}.passkey.challenge`, value: challenge, maxAge: 300, httpOnly: true, path: '/' });
          return new Response(JSON.stringify({ options }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        },
      },
      {
        method: 'POST', path: '/passkey/login/verify',
        async handler(rctx) {
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const challenge = rctx.cookies.get(`${prefix}.passkey.challenge`);
          if (!challenge) return jsonError('NO_CHALLENGE', 400);
          const api = rctx.plugin.getPlugin<PasskeyApi>(PLUGIN_ID);
          const { user, tokens } = await api.loginVerify({
            response: rctx.body.response,
            expectedChallenge: challenge,
            ip: rctx.meta.ip,
            userAgent: rctx.meta.userAgent,
          });
          const accessTtl = rctx.plugin.config.tokens?.accessTtl ?? 900;
          const refreshTtl = rctx.plugin.config.tokens?.refreshTtl ?? 2592000;
          rctx.setCookie({ name: `${prefix}.at`, value: tokens.accessToken, maxAge: accessTtl, httpOnly: true, path: '/' });
          rctx.setCookie({ name: `${prefix}.rt`, value: tokens.refreshToken, maxAge: refreshTtl, httpOnly: true, path: '/api/auth' });
          rctx.setCookie({ name: `${prefix}.csrf`, value: tokens.csrfToken, maxAge: refreshTtl, httpOnly: false, path: '/' });
          rctx.setCookie({ name: `${prefix}.passkey.challenge`, value: '', maxAge: 0, httpOnly: true, path: '/' });
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
    ],

    api(ctx: PluginContext): PasskeyApi {
      return {
        async registerOptions(userId) {
          const id = sanitizeString(userId, 'userId');
          const user = await ctx.config.adapters.user.getUserById(id);
          if (!user) throw new HoleauthError('NOT_FOUND', 'user not found', 404);
          const webauthn = await loadWebAuthn();
          const existing = await adapter.list(id);
          const options = await webauthn.generateRegistrationOptions({
            rpID,
            rpName,
            userID: new TextEncoder().encode(id),
            userName: user.email,
            userDisplayName: user.name ?? user.email,
            attestationType: 'none',
            excludeCredentials: existing.map((c) => ({
              id: c.credentialId,
              transports: (c.transports as ['usb'] | undefined) ?? undefined,
            })),
          });
          return { options, challenge: options.challenge };
        },

        async registerVerify(userId, input) {
          const id = sanitizeString(userId, 'userId');
          const expectedChallenge = sanitizeString(input.expectedChallenge, 'expectedChallenge');
          const webauthn = await loadWebAuthn();
          const verification = await webauthn.verifyRegistrationResponse({
            response: input.response as Parameters<typeof webauthn.verifyRegistrationResponse>[0]['response'],
            expectedChallenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpID,
          });
          if (!verification.verified || !verification.registrationInfo) {
            throw new HoleauthError('PASSKEY_VERIFY_FAILED', 'passkey registration failed', 400);
          }
          const reg = verification.registrationInfo;
          const credential = (reg as unknown as { credential?: { id: string; publicKey: Uint8Array; counter: number } }).credential;
          const rawCredentialId = credential?.id ?? (reg as unknown as { credentialID: string }).credentialID;
          const publicKey = credential?.publicKey ?? (reg as unknown as { credentialPublicKey: Uint8Array }).credentialPublicKey;
          const counter = credential?.counter ?? (reg as unknown as { counter: number }).counter;
          const credentialId = typeof rawCredentialId === 'string' ? rawCredentialId : bufferToB64url(rawCredentialId);
          await adapter.create({
            userId: id,
            credentialId,
            publicKey: bufferToB64url(publicKey),
            counter,
            transports: null,
            deviceName: input.deviceName ? sanitizeString(input.deviceName, 'deviceName', { optional: true }) || null : null,
          });
          return { credentialId };
        },

        async loginOptions(userId) {
          const webauthn = await loadWebAuthn();
          let allow: { id: string; transports?: ['usb'] }[] | undefined;
          if (userId) {
            const id = sanitizeString(userId, 'userId');
            const creds = await adapter.list(id);
            // Treat "no credentials" identically to "no userId" so that a
            // caller cannot probe user existence via the response shape.
            allow = creds.length
              ? creds.map((c) => ({ id: c.credentialId, transports: (c.transports as ['usb'] | undefined) ?? undefined }))
              : undefined;
          }
          const options = await webauthn.generateAuthenticationOptions({
            rpID,
            allowCredentials: allow,
            userVerification: 'preferred',
          });
          return { options, challenge: options.challenge };
        },

        async loginVerify(input) {
          const expectedChallenge = sanitizeString(input.expectedChallenge, 'expectedChallenge');
          const raw = (input.response ?? {}) as { id?: string; rawId?: string };
          const credentialId = raw.id ?? raw.rawId;
          if (!credentialId || typeof credentialId !== 'string' || credentialId.length > MAX_STRING_LENGTH) {
            throw new HoleauthError('PASSKEY_INVALID_INPUT', 'response.id is required', 400);
          }
          const rateKey = `${credentialId}:${input.ip ?? 'unknown'}`;
          await guardRate(rateLimiter, rateKey);
          const record = await adapter.getByCredentialId(credentialId);
          if (!record) throw new HoleauthError('PASSKEY_UNKNOWN', 'unknown credential', 400);
          const webauthn = await loadWebAuthn();
          const verification = await webauthn.verifyAuthenticationResponse({
            response: input.response as Parameters<typeof webauthn.verifyAuthenticationResponse>[0]['response'],
            expectedChallenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpID,
            credential: {
              id: record.credentialId,
              publicKey: b64urlToBuffer(record.publicKey),
              counter: record.counter,
            },
          });
          if (!verification.verified) {
            throw new HoleauthError('PASSKEY_VERIFY_FAILED', 'passkey login failed', 400);
          }
          // Counter regression is a strong cloned-authenticator signal.
          // simplewebauthn-v11 already throws when newCounter <= counter for
          // counter-using authenticators, but we double-check defensively.
          const newCounter = verification.authenticationInfo.newCounter;
          if (record.counter > 0 && newCounter <= record.counter) {
            throw new HoleauthError('PASSKEY_COUNTER_REGRESSION', 'authenticator counter regression', 400);
          }
          await adapter.updateCounter(record.credentialId, newCounter);
          await rateLimiter.reset(rateKey);
          return ctx.core.completeSignIn(record.userId, {
            method: 'passkey',
            ip: input.ip,
            userAgent: input.userAgent,
          });
        },

        async list(userId) {
          const id = sanitizeString(userId, 'userId');
          return adapter.list(id);
        },
        async delete(userId, credentialId) {
          const uid = sanitizeString(userId, 'userId');
          const cid = sanitizeString(credentialId, 'credentialId');
          const rec = await adapter.getByCredentialId(cid);
          if (!rec || rec.userId !== uid) throw new HoleauthError('NOT_FOUND', 'credential not found', 404);
          await adapter.delete(rec.id);
        },
      };
    },
  });
}
