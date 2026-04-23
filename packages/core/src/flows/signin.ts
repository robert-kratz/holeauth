import type { HoleauthConfig, SignInResult } from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { verify as pwVerify } from '../password/index.js';
import { sign, verify as jwtVerify } from '../jwt/index.js';
import { issueSession } from '../session/issue.js';
import { CredentialsError } from '../errors/index.js';
import { emit } from '../events/emitter.js';

export interface SignInInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Password signIn. Plugins can halt the flow via `signIn.challenge` hook
 * (e.g. to require 2FA). If any plugin challenge returns a non-null
 * result, signIn returns `kind: 'pending'` with the plugin's token.
 */
export async function signIn(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: SignInInput,
): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();
  await hooks.runSignInBefore({ email, ip: input.ip, userAgent: input.userAgent });

  const user = await cfg.adapters.user.getUserByEmail(email);
  if (!user || !user.passwordHash) throw new CredentialsError();

  const ok = await pwVerify(input.password, user.passwordHash);
  if (!ok) throw new CredentialsError();

  const challenge = await hooks.runSignInChallenge(user, {
    ip: input.ip,
    userAgent: input.userAgent,
  });
  if (challenge) {
    await emit(cfg, {
      type: 'user.signed_in',
      userId: user.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      data: { stage: 'pending', pluginId: challenge.pluginId },
    });
    return {
      kind: 'pending',
      pluginId: challenge.pluginId,
      userId: user.id,
      pendingToken: challenge.pendingToken,
      pendingExpiresAt: challenge.expiresAt,
      data: challenge.data ?? null,
    };
  }

  const tokens = await issueSession(cfg, {
    userId: user.id,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  await emit(cfg, {
    type: 'user.signed_in',
    userId: user.id,
    sessionId: tokens.sessionId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    data: { method: 'password' },
  });
  await hooks.runSignInAfter({ user, tokens, method: 'password' });
  return { kind: 'ok', user, tokens };
}

/**
 * Issue a short-lived pending token on behalf of a plugin challenge.
 * Plugins receive this helper via PluginContext and should use it so the
 * claim shape is consistent (`typ: 'pending', pid: <pluginId>`).
 */
export async function issuePendingToken(
  cfg: HoleauthConfig,
  input: { userId: string; pluginId: string; ttlSeconds?: number; extra?: Record<string, unknown> },
): Promise<{ token: string; expiresAt: number }> {
  const ttl = input.ttlSeconds ?? cfg.tokens?.pendingTtl ?? 300;
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { sub: input.userId, typ: 'pending', pid: input.pluginId, ...(input.extra ?? {}) },
    cfg.secrets.jwtSecret,
    { expiresIn: `${ttl}s` },
  );
  return { token, expiresAt: (now + ttl) * 1000 };
}

export async function verifyPendingToken(
  cfg: HoleauthConfig,
  token: string,
  expectedPluginId: string,
): Promise<{ userId: string; extra: Record<string, unknown> }> {
  const claims = await jwtVerify<{ sub?: string; typ?: string; pid?: string } & Record<string, unknown>>(
    token,
    cfg.secrets.jwtSecret,
  );
  if (claims.typ !== 'pending' || claims.pid !== expectedPluginId || !claims.sub) {
    throw new CredentialsError('pending token invalid');
  }
  // Strip reserved claims, return remaining as `extra`.
  const { sub, typ, pid, exp, iat, nbf, jti, ...extra } = claims as Record<string, unknown> & {
    sub: string;
    typ: string;
    pid: string;
  };
  void typ; void pid; void exp; void iat; void nbf; void jti;
  return { userId: sub, extra };
}
