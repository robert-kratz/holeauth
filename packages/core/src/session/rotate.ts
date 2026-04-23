import type { HoleauthConfig, IssuedTokens } from '../types/index.js';
import { sign, verify } from '../jwt/index.js';
import { generateCsrfToken } from '../cookies/csrf.js';
import { emit } from '../events/emitter.js';
import { getHookRunner } from '../plugins/runner-ref.js';
import { sha256b64url } from './hash.js';
import { InvalidTokenError, RefreshReuseError, SessionExpiredError } from '../errors/index.js';

const ACCESS_DEFAULT = 900;
const REFRESH_DEFAULT = 2592000;

/**
 * Rotate-on-use with reuse detection.
 *
 *  1. Decode refresh JWT → recover sid, fam, sub.
 *  2. Hash presented token; look it up.
 *     - If not found, the token was already rotated away → reuse! Revoke family.
 *  3. Issue new access + refresh, rotate hash in storage atomically.
 *
 * Returns a fresh IssuedTokens tuple. Session id + family stay stable.
 */
export async function rotateRefresh(
  cfg: HoleauthConfig,
  presentedRefresh: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssuedTokens> {
  let claims: { sid?: string; sub?: string; fam?: string; typ?: string; exp?: number };
  try {
    claims = await verify(presentedRefresh, cfg.secrets.jwtSecret);
  } catch {
    throw new InvalidTokenError('refresh token invalid');
  }
  if (claims.typ !== 'refresh' || !claims.sid || !claims.sub || !claims.fam) {
    throw new InvalidTokenError('refresh claims malformed');
  }

  const presentedHash = await sha256b64url(presentedRefresh);
  const found = await cfg.adapters.session.getByRefreshHash(presentedHash);

  if (!found || found.revokedAt) {
    // Reuse detected — revoke whole family, record an event, throw.
    await cfg.adapters.session.revokeFamily(claims.fam);
    await emit(cfg, {
      type: 'session.reuse_detected',
      userId: claims.sub,
      sessionId: claims.sid,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      data: { familyId: claims.fam },
    });
    throw new RefreshReuseError();
  }

  if (found.expiresAt.getTime() < Date.now()) {
    await cfg.adapters.session.revokeFamily(claims.fam);
    throw new SessionExpiredError();
  }

  const accessTtl = cfg.tokens?.accessTtl ?? ACCESS_DEFAULT;
  const refreshTtl = cfg.tokens?.refreshTtl ?? REFRESH_DEFAULT;
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    sign(
      { sid: found.id, sub: found.userId, fam: found.familyId, nce: nonce },
      cfg.secrets.jwtSecret,
      { expiresIn: `${accessTtl}s` },
    ),
    sign(
      { sid: found.id, sub: found.userId, fam: found.familyId, typ: 'refresh', nce: nonce },
      cfg.secrets.jwtSecret,
      { expiresIn: `${refreshTtl}s`, jti: nonce },
    ),
  ]);
  const newHash = await sha256b64url(refreshToken);
  await cfg.adapters.session.rotateRefresh(
    found.id,
    newHash,
    new Date((now + refreshTtl) * 1000),
  );

  await emit(cfg, {
    type: 'session.rotated',
    userId: found.userId,
    sessionId: found.id,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    data: { familyId: found.familyId },
  });
  await getHookRunner(cfg).runSessionRotate({
    userId: found.userId,
    sessionId: found.id,
    familyId: found.familyId,
  });

  return {
    accessToken,
    refreshToken,
    csrfToken: generateCsrfToken(),
    sessionId: found.id,
    familyId: found.familyId,
    accessExpiresAt: (now + accessTtl) * 1000,
    refreshExpiresAt: (now + refreshTtl) * 1000,
  };
}
