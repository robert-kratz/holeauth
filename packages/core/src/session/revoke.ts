import type { HoleauthConfig } from '../types/index.js';
import { verify } from '../jwt/index.js';
import { emit } from '../events/emitter.js';
import { getHookRunner } from '../plugins/runner-ref.js';

/** Revoke a single session by id (signout). */
export async function revokeSession(cfg: HoleauthConfig, sessionId: string, userId?: string): Promise<void> {
  await cfg.adapters.session.deleteSession(sessionId);
  await emit(cfg, {
    type: 'session.revoked',
    userId: userId ?? null,
    sessionId,
  });
  await getHookRunner(cfg).runSessionRevoke({ userId: userId ?? null, sessionId });
}

/** Revoke by presented refresh token (best-effort). */
export async function revokeByRefresh(cfg: HoleauthConfig, refreshToken: string): Promise<void> {
  try {
    const p = await verify<{ sid?: string; sub?: string }>(refreshToken, cfg.secrets.jwtSecret);
    if (p.sid) {
      await cfg.adapters.session.deleteSession(p.sid);
      await emit(cfg, { type: 'session.revoked', userId: p.sub ?? null, sessionId: p.sid });
      await getHookRunner(cfg).runSessionRevoke({ userId: p.sub ?? null, sessionId: p.sid });
    }
  } catch { /* ignore */ }
}

/** Global signout — all sessions for a user. */
export async function revokeAllForUser(cfg: HoleauthConfig, userId: string): Promise<void> {
  if (cfg.adapters.session.revokeUser) {
    await cfg.adapters.session.revokeUser(userId);
    await emit(cfg, { type: 'session.revoked', userId, data: { scope: 'all' } });
    await getHookRunner(cfg).runSessionRevoke({ userId, sessionId: null, scope: 'all' });
  }
}
