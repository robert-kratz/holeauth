import type { HoleauthConfig, IssuedTokens } from '../types/index.js';
import { sign } from '../jwt/index.js';
import { generateCsrfToken } from '../cookies/csrf.js';
import { emit } from '../events/emitter.js';
import { getHookRunner } from '../plugins/runner-ref.js';
import { sha256b64url } from './hash.js';

const ACCESS_DEFAULT = 900;      // 15m
const REFRESH_DEFAULT = 2592000; // 30d

export interface IssueInput {
  userId: string;
  /** Omit to start a fresh family (e.g. on a real login). */
  familyId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Mint a brand new session row + JWT pair + CSRF token.
 * Used by: fresh login, passkey login, SSO callback, 2FA verify.
 */
export async function issueSession(cfg: HoleauthConfig, input: IssueInput): Promise<IssuedTokens> {
  const accessTtl = cfg.tokens?.accessTtl ?? ACCESS_DEFAULT;
  const refreshTtl = cfg.tokens?.refreshTtl ?? REFRESH_DEFAULT;
  const now = Math.floor(Date.now() / 1000);

  const familyId = input.familyId ?? crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    sign(
      { sid: sessionId, sub: input.userId, fam: familyId, nce: nonce },
      cfg.secrets.jwtSecret,
      { expiresIn: `${accessTtl}s` },
    ),
    sign(
      { sid: sessionId, sub: input.userId, fam: familyId, typ: 'refresh', nce: nonce },
      cfg.secrets.jwtSecret,
      { expiresIn: `${refreshTtl}s`, jti: nonce },
    ),
  ]);
  const refreshTokenHash = await sha256b64url(refreshToken);

  await cfg.adapters.session.createSession({
    id: sessionId,
    userId: input.userId,
    familyId,
    refreshTokenHash,
    expiresAt: new Date((now + refreshTtl) * 1000),
    createdAt: new Date(),
    revokedAt: null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  const csrfToken = generateCsrfToken();

  await emit(cfg, {
    type: 'session.created',
    userId: input.userId,
    sessionId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    data: { familyId },
  });
  await getHookRunner(cfg).runSessionIssue({ userId: input.userId, sessionId, familyId });

  return {
    accessToken,
    refreshToken,
    csrfToken,
    sessionId,
    familyId,
    accessExpiresAt: (now + accessTtl) * 1000,
    refreshExpiresAt: (now + refreshTtl) * 1000,
  };
}
