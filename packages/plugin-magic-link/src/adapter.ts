/**
 * MagicLinkAdapter — plugin-owned storage for short-lived sign-in tokens.
 *
 * One row backs both flows:
 *  - `type: 'magic-link'` stores a hash of the opaque URL token.
 *  - `type: 'otp'` stores a hash of the numeric code; `identifier` (email)
 *    is the lookup key for verification.
 */
export type MagicLinkTokenType = 'magic-link' | 'otp';

export interface MagicLinkRecord {
  id: string;
  /** Email address the token was issued for. */
  identifier: string;
  /** SHA-256 hash of the plaintext token / code (base64url). */
  tokenHash: string;
  type: MagicLinkTokenType;
  /** Optional user id, set on creation if the user already exists. */
  userId: string | null;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateMagicLinkInput {
  identifier: string;
  tokenHash: string;
  type: MagicLinkTokenType;
  userId?: string | null;
  expiresAt: Date;
}

export interface MagicLinkAdapter {
  /** Persist a new token row and return it. */
  createToken(input: CreateMagicLinkInput): Promise<MagicLinkRecord>;

  /**
   * Look up a token by its hash regardless of type, usedAt, or expiry.
   * Used only in the error-path after a failed `atomicConsumeByHash` to
   * determine the specific failure reason (not found / already used / expired).
   */
  findByTokenHash(tokenHash: string): Promise<MagicLinkRecord | null>;

  /**
   * Find the most recent valid (usedAt IS NULL AND expiresAt > NOW()) token
   * for the given identifier and type.
   *
   * Used by `request()` for idempotency (skip sendEmail if a valid token
   * already exists) and by `verifyOtp()` before the constant-time comparison.
   */
  findActiveToken(identifier: string, type: MagicLinkTokenType): Promise<MagicLinkRecord | null>;

  /**
   * @deprecated Use `findActiveToken(identifier, 'otp')` instead.
   * Retained for backward-compatibility of existing custom adapters.
   * Will be removed in the next major version.
   */
  findActiveOtp(identifier: string): Promise<MagicLinkRecord | null>;

  /**
   * Atomically mark a magic-link token as consumed.
   *
   * Must be implemented as a single atomic statement, e.g.:
   *   `UPDATE … SET usedAt = NOW() WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > NOW() RETURNING *`
   *
   * Returns the consumed record on success, or `null` when the token does not
   * exist, is already consumed, or is expired — preventing double-consume race
   * conditions.
   */
  atomicConsumeByHash(tokenHash: string): Promise<MagicLinkRecord | null>;

  /**
   * Atomically mark a token as consumed by its ID.
   *
   * Must be implemented as a single atomic statement:
   *   `UPDATE … SET usedAt = NOW() WHERE id = ? AND usedAt IS NULL RETURNING *`
   *
   * Returns the consumed record on success, or `null` if the token was already
   * consumed (concurrent OTP verification). No expiry check — callers
   * (`verifyOtp`) must pre-filter via `findActiveToken`.
   */
  atomicConsumeById(id: string): Promise<MagicLinkRecord | null>;

  /** Delete every token for a given email (used by request to evict prior tokens). */
  deleteByIdentifier(identifier: string, type?: MagicLinkTokenType): Promise<void>;
  /** Garbage-collect expired rows (best-effort). */
  deleteExpired(): Promise<void>;
  /** Cascade cleanup on user delete (best-effort — caller catches). */
  deleteByUserId(userId: string): Promise<void>;
  /**
   * Return the most recently created token for an identifier+type pair,
   * regardless of usedAt / expiresAt. Used for resend-cooldown checks.
   */
  findLatestByIdentifier(identifier: string, type: MagicLinkTokenType): Promise<MagicLinkRecord | null>;
}
