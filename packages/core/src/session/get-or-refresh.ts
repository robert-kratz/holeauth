import type {
  HoleauthInstance,
  IssuedTokens,
  SessionData,
} from '../types/index.js';
import { validateSession } from './validate.js';

export interface GetSessionOrRefreshInput {
  /** Current access token (if any). */
  accessToken?: string | null;
  /** Current refresh token (if any). When present, used to rotate on access miss. */
  refreshToken?: string | null;
  /** Request metadata, forwarded to refresh hooks/audit log. */
  ip?: string;
  userAgent?: string;
}

export interface GetSessionOrRefreshResult {
  /** Resolved session, or null if both validation and refresh failed. */
  session: SessionData | null;
  /** Freshly-issued token bundle when a refresh actually occurred. */
  tokens: IssuedTokens | null;
  /** True if this call rotated the refresh token. */
  refreshed: boolean;
}

/**
 * Validate the access token and, if invalid/missing, transparently rotate the
 * refresh token to obtain a new session. Framework-agnostic — used by the
 * Next.js middleware/server helpers and intended for consumption from API
 * server middleware (tRPC, Hono, plain route handlers, …).
 *
 * Cookies are NOT touched here; the caller decides how to surface the new
 * token bundle (Set-Cookie headers, in-memory store, etc.).
 *
 * Returns:
 *  - `session` the resolved session (or `null`),
 *  - `tokens` the newly-issued token bundle when a refresh occurred,
 *  - `refreshed` whether rotation happened.
 *
 * @example
 * ```ts
 * const { session, tokens } = await getSessionOrRefresh(auth, {
 *   accessToken: req.cookies.get('holeauth.at')?.value,
 *   refreshToken: req.cookies.get('holeauth.rt')?.value,
 *   ip, userAgent,
 * });
 * if (tokens) writeAuthCookies(auth.config, res.headers, tokens);
 * ```
 */
export async function getSessionOrRefresh(
  instance: HoleauthInstance,
  input: GetSessionOrRefreshInput,
): Promise<GetSessionOrRefreshResult> {
  const { accessToken, refreshToken, ip, userAgent } = input;

  // 1. Fast path: valid access token.
  if (accessToken) {
    const session = await validateSession(instance.config, accessToken);
    if (session && session.expiresAt > Date.now()) {
      return { session, tokens: null, refreshed: false };
    }
  }

  // 2. Refresh fallback.
  if (!refreshToken) {
    return { session: null, tokens: null, refreshed: false };
  }

  let tokens: IssuedTokens;
  try {
    tokens = await instance.refresh({ refreshToken, ip, userAgent });
  } catch {
    // Reuse, expiry, malformed — caller should clear cookies.
    return { session: null, tokens: null, refreshed: false };
  }

  const session = await validateSession(instance.config, tokens.accessToken);
  return { session, tokens, refreshed: true };
}
