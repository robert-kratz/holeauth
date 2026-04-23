/**
 * Adapter interfaces. ORM/database-specific adapters live in separate packages
 * (e.g. @holeauth/adapter-prisma, @holeauth/adapter-drizzle).
 *
 * Plugin-specific data (2FA credentials, passkeys, RBAC assignments, …)
 * is owned by the plugin's own adapter interface — never carried on the
 * User row.
 */

export interface AdapterUser {
  id: string;
  email: string;
  emailVerified?: Date | null;
  name?: string | null;
  image?: string | null;
  passwordHash?: string | null;
}

export interface AdapterSession {
  id: string;
  userId: string;
  /** Refresh-token family (all rotations in a login chain share this). */
  familyId: string;
  /** SHA-256(refreshToken) — never store the raw token. */
  refreshTokenHash: string;
  expiresAt: Date;
  createdAt?: Date;
  revokedAt?: Date | null;
  userAgent?: string | null;
  ip?: string | null;
}

export interface AdapterAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  tokenType?: string | null;
  scope?: string | null;
  idToken?: string | null;
}

export interface AdapterVerificationToken {
  identifier: string;
  token: string;
  expiresAt: Date;
}

export interface AdapterAuditEvent {
  id?: string;
  type: string;
  userId?: string | null;
  sessionId?: string | null;
  at?: Date;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown> | null;
}

/* ──────────────────────────── USER ──────────────────────────── */
export interface UserAdapter {
  getUserById(id: string): Promise<AdapterUser | null>;
  getUserByEmail(email: string): Promise<AdapterUser | null>;
  createUser(data: Omit<AdapterUser, 'id'>): Promise<AdapterUser>;
  updateUser(id: string, patch: Partial<AdapterUser>): Promise<AdapterUser>;
  deleteUser(id: string): Promise<void>;
}

/* ─────────────────────────── SESSION ────────────────────────── */
export interface SessionAdapter {
  /** Persist a session using the provided id (so callers can bind tokens before write). */
  createSession(data: AdapterSession): Promise<AdapterSession>;
  getSession(id: string): Promise<AdapterSession | null>;
  getByRefreshHash(hash: string): Promise<AdapterSession | null>;
  findByFamily(familyId: string): Promise<AdapterSession[]>;
  deleteSession(id: string): Promise<void>;
  /** Replace hash+exp atomically; returns the updated session. */
  rotateRefresh(id: string, newHash: string, expiresAt: Date): Promise<AdapterSession>;
  /** Revoke all sessions in a family (reuse-detection response). */
  revokeFamily(familyId: string): Promise<void>;
  /** Revoke all sessions for a user (global signout). */
  revokeUser?(userId: string): Promise<void>;
}

/* ─────────────────────────── ACCOUNT ────────────────────────── */
export interface AccountAdapter {
  linkAccount(data: Omit<AdapterAccount, 'id'>): Promise<AdapterAccount>;
  getAccountByProvider(provider: string, providerAccountId: string): Promise<AdapterAccount | null>;
  getByProviderEmail?(provider: string, email: string): Promise<AdapterAccount | null>;
  listByUser(userId: string): Promise<AdapterAccount[]>;
  unlinkAccount(id: string): Promise<void>;
}

/* ─────────────────────── VERIFICATION TOKEN ─────────────────── */
export interface VerificationTokenAdapter {
  create(data: AdapterVerificationToken): Promise<AdapterVerificationToken>;
  consume(identifier: string, token: string): Promise<AdapterVerificationToken | null>;
  /** Optional: purge expired rows (maintenance). */
  purgeExpired?(): Promise<number>;
  /** Optional: list all rows whose identifier starts with the given prefix. */
  listByIdentifierPrefix?(prefix: string): Promise<AdapterVerificationToken[]>;
  /** Optional: delete all rows with the exact identifier. Returns number of rows removed. */
  deleteByIdentifier?(identifier: string): Promise<number>;
}

/* ───────────────────────── AUDIT LOG ────────────────────────── */
export interface AuditLogAdapter {
  /** Persist an event. MUST be awaited by flows. */
  record(event: AdapterAuditEvent): Promise<void>;
  list?(filter: { userId?: string; type?: string; limit?: number }): Promise<AdapterAuditEvent[]>;
}

/* ───────────────────────── TRANSACTIONS ─────────────────────── */
/**
 * Optional transaction primitive. When provided, multi-step writes
 * (deleteUser, signout with family revoke, password-change with session
 * revoke, sso.callback create+link) are wrapped in a transaction.
 *
 * Implementations SHOULD propagate the tx through all adapter method
 * calls invoked inside `fn` (e.g. by returning a fresh adapter bundle
 * bound to the tx, or by using async-local-storage).
 *
 * If no transaction adapter is supplied, core falls back to sequential
 * execution without atomicity.
 */
export interface TransactionAdapter {
  run<T>(fn: () => Promise<T>): Promise<T>;
}
