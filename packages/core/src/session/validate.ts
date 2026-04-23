import type { HoleauthConfig, SessionData } from '../types/index.js';
import { verify } from '../jwt/index.js';

/**
 * Edge-compatible: verifies the access JWT only. Does not touch adapters.
 * Use this in middleware / hot paths.
 */
export async function validateSession(cfg: HoleauthConfig, token: string): Promise<SessionData | null> {
  try {
    const p = await verify<{ sid: string; sub: string; fam?: string; exp?: number }>(
      token,
      cfg.secrets.jwtSecret,
    );
    if (!p.sid || !p.sub) return null;
    return {
      sessionId: p.sid,
      userId: p.sub,
      expiresAt: (p.exp ?? 0) * 1000,
      familyId: p.fam,
    };
  } catch {
    return null;
  }
}
