/**
 * TwoFactorAdapter — plugin-owned storage for TOTP secrets + recovery codes.
 *
 * Implementations live in the per-ORM adapter packages
 * (`@holeauth/adapter-drizzle/plugin-2fa`, `@holeauth/adapter-prisma/plugin-2fa`).
 */
export interface TwoFactorRecord {
  userId: string;
  /** base32 TOTP secret. */
  secret: string;
  enabled: boolean;
  /** Argon2-hashed recovery codes (10 codes, one-time use). */
  recoveryCodes: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TwoFactorAdapter {
  getByUserId(userId: string): Promise<TwoFactorRecord | null>;
  upsert(record: TwoFactorRecord): Promise<TwoFactorRecord>;
  update(userId: string, patch: Partial<TwoFactorRecord>): Promise<TwoFactorRecord | null>;
  delete(userId: string): Promise<void>;
}
