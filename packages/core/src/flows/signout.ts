import type { HoleauthConfig } from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { revokeByRefresh, revokeSession } from '../session/revoke.js';
import { verify } from '../jwt/index.js';
import { emit } from '../events/emitter.js';

export interface SignOutInput {
  accessToken?: string;
  refreshToken?: string;
}

export async function signOut(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: SignOutInput,
): Promise<void> {
  let userId: string | null = null;
  let sessionId: string | null = null;

  if (input.refreshToken) {
    await revokeByRefresh(cfg, input.refreshToken);
  } else if (input.accessToken) {
    try {
      const p = await verify<{ sid?: string; sub?: string }>(input.accessToken, cfg.secrets.jwtSecret);
      if (p.sid) {
        sessionId = p.sid;
        userId = p.sub ?? null;
        await revokeSession(cfg, p.sid, p.sub);
      }
    } catch { /* ignore */ }
  }

  await emit(cfg, {
    type: 'user.signed_out',
    userId,
    sessionId,
  });
  await hooks.runSignOutAfter({ userId, sessionId });
}
