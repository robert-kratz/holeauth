import type { HoleauthConfig, IssuedTokens } from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { rotateRefresh } from '../session/rotate.js';
import { verify } from '../jwt/index.js';

export interface RefreshInput {
  refreshToken: string;
  ip?: string;
  userAgent?: string;
}

export async function refresh(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: RefreshInput,
): Promise<IssuedTokens> {
  await hooks.runRefreshBefore({ ip: input.ip, userAgent: input.userAgent });
  const tokens = await rotateRefresh(cfg, input.refreshToken, {
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  // Extract userId from the freshly-issued access token for the hook payload.
  let userId = '';
  try {
    const p = await verify<{ sub?: string }>(tokens.accessToken, cfg.secrets.jwtSecret);
    userId = p.sub ?? '';
  } catch { /* leave blank */ }
  await hooks.runRefreshAfter({
    userId,
    sessionId: tokens.sessionId,
    tokens,
  });
  return tokens;
}
