/**
 * @holeauth/plugin-passkey
 *
 * WebAuthn / Passkey authentication as a holeauth plugin.
 *
 * Uses @simplewebauthn/server under the hood. The consumer application
 * is responsible for the browser-side ceremony (via @simplewebauthn/browser)
 * and posting the response JSON to the plugin-mounted routes.
 *
 * NOTE: this is a first-pass implementation of the plugin; the original
 * core passkey module has moved here verbatim in spirit — the public HTTP
 * surface is compatible with the prior core endpoints, just relocated.
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

export type { PasskeyAdapter, PasskeyRecord } from './adapter.js';

const PLUGIN_ID = 'passkey' as const;

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

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter,

    hooks: {
      userDelete: {
        async after({ userId }) {
          const creds = await adapter.list(userId).catch(() => []);
          for (const c of creds) await adapter.delete(c.id).catch(() => {});
        },
      },
    },

    routes: [
      {
        method: 'POST', path: '/passkey/register/options',
        requireAuth: true, requireCsrf: true,
        async handler(rctx) {
          const s = await rctx.getSession();
          if (!s) return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 });
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
          if (!s) return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 });
          const prefix = rctx.plugin.config.tokens?.cookiePrefix ?? 'holeauth';
          const challenge = rctx.cookies.get(`${prefix}.passkey.challenge`);
          if (!challenge) return new Response(JSON.stringify({ error: { code: 'NO_CHALLENGE' } }), { status: 400 });
          const api = rctx.plugin.getPlugin<PasskeyApi>(PLUGIN_ID);
          const out = await api.registerVerify(s.userId, {
            response: rctx.body.response,
            expectedChallenge: challenge,
            deviceName: rctx.body.deviceName ? String(rctx.body.deviceName) : undefined,
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
          const userId = rctx.body.userId ? String(rctx.body.userId) : undefined;
          const { options, challenge } = await api.loginOptions(userId);
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
          if (!challenge) return new Response(JSON.stringify({ error: { code: 'NO_CHALLENGE' } }), { status: 400 });
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
          const user = await ctx.config.adapters.user.getUserById(userId);
          if (!user) throw new HoleauthError('NOT_FOUND', 'user not found', 404);
          const webauthn = await loadWebAuthn();
          const existing = await adapter.list(userId);
          const options = await webauthn.generateRegistrationOptions({
            rpID,
            rpName,
            userID: new TextEncoder().encode(userId),
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
          const webauthn = await loadWebAuthn();
          const verification = await webauthn.verifyRegistrationResponse({
            response: input.response as Parameters<typeof webauthn.verifyRegistrationResponse>[0]['response'],
            expectedChallenge: input.expectedChallenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpID,
          });
          if (!verification.verified || !verification.registrationInfo) {
            throw new HoleauthError('PASSKEY_VERIFY_FAILED', 'passkey registration failed', 400);
          }
          const reg = verification.registrationInfo;
          // simplewebauthn v11 nests the credential under `credential`
          const credential = (reg as unknown as { credential?: { id: string; publicKey: Uint8Array; counter: number } }).credential;
          const credentialId = credential?.id ?? (reg as unknown as { credentialID: string }).credentialID;
          const publicKey = credential?.publicKey ?? (reg as unknown as { credentialPublicKey: Uint8Array }).credentialPublicKey;
          const counter = credential?.counter ?? (reg as unknown as { counter: number }).counter;
          await adapter.create({
            userId,
            credentialId: typeof credentialId === 'string' ? credentialId : bufferToB64url(credentialId),
            publicKey: bufferToB64url(publicKey),
            counter,
            transports: null,
            deviceName: input.deviceName ?? null,
          });
          return { credentialId: typeof credentialId === 'string' ? credentialId : bufferToB64url(credentialId) };
        },

        async loginOptions(userId) {
          const webauthn = await loadWebAuthn();
          const allow = userId
            ? (await adapter.list(userId)).map((c) => ({ id: c.credentialId, transports: (c.transports as ['usb'] | undefined) ?? undefined }))
            : undefined;
          const options = await webauthn.generateAuthenticationOptions({
            rpID,
            allowCredentials: allow,
            userVerification: 'preferred',
          });
          return { options, challenge: options.challenge };
        },

        async loginVerify(input) {
          const webauthn = await loadWebAuthn();
          const raw = input.response as { id?: string; rawId?: string };
          const credentialId = raw.id ?? raw.rawId ?? '';
          const record = await adapter.getByCredentialId(credentialId);
          if (!record) throw new HoleauthError('PASSKEY_UNKNOWN', 'unknown credential', 400);
          const verification = await webauthn.verifyAuthenticationResponse({
            response: input.response as Parameters<typeof webauthn.verifyAuthenticationResponse>[0]['response'],
            expectedChallenge: input.expectedChallenge,
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
          await adapter.updateCounter(record.credentialId, verification.authenticationInfo.newCounter);
          return ctx.core.completeSignIn(record.userId, {
            method: 'passkey',
            ip: input.ip,
            userAgent: input.userAgent,
          });
        },

        list(userId) { return adapter.list(userId); },
        async delete(userId, credentialId) {
          const rec = await adapter.getByCredentialId(credentialId);
          if (!rec || rec.userId !== userId) throw new HoleauthError('NOT_FOUND', 'credential not found', 404);
          await adapter.delete(rec.id);
        },
      };
    },
  });
}
