/**
 * Session management helpers for the playground.
 *
 * Holeauth core does not expose a "list sessions" adapter method (by design:
 * the core only needs CRUD-by-id / refresh-hash / family lookups for the
 * auth flows). For UI purposes (self-service + admin) we query the drizzle
 * table directly and use `@holeauth/core`'s `revokeSession` /
 * `revokeAllForUser` for writes so event hooks still fire.
 */
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { revokeSession as coreRevokeSession } from '@holeauth/core/session';
import { db } from '@/db/client';
import { sessions, users } from '@/db/schema';
import { auth } from '@/lib/auth';

export interface SessionRow {
  id: string;
  userId: string;
  familyId: string;
  createdAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ip: string | null;
}

export interface SessionRowWithUser extends SessionRow {
  userEmail: string | null;
  userName: string | null;
}

/** List sessions belonging to a single user, most recent first. */
export async function listUserSessions(
  userId: string,
  opts: { includeRevoked?: boolean } = {},
): Promise<SessionRow[]> {
  const whereClause = opts.includeRevoked
    ? eq(sessions.userId, userId)
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      familyId: sessions.familyId,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
    })
    .from(sessions)
    .where(whereClause)
    .orderBy(desc(sessions.createdAt));
  return rows;
}

/** List all sessions (admin). Joins the app user table for display. */
export async function listAllSessions(
  opts: { includeRevoked?: boolean; limit?: number } = {},
): Promise<SessionRowWithUser[]> {
  const whereClause = opts.includeRevoked ? undefined : isNull(sessions.revokedAt);
  const q = db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      familyId: sessions.familyId,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      userEmail: users.email,
      userName: users.name,
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .orderBy(desc(sessions.createdAt))
    .limit(opts.limit ?? 200);
  const rows = whereClause ? await q.where(whereClause) : await q;
  return rows;
}

/**
 * Revoke one session if it belongs to the given user. Returns true if a row
 * was affected. Uses core `revokeSession` so `session.revoked` event fires.
 */
export async function revokeSessionForUser(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!row) return false;
  await coreRevokeSession(auth.config, sessionId, userId);
  return true;
}

/** Admin revoke — no ownership check; returns true if a row existed. */
export async function adminRevokeSession(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return false;
  await coreRevokeSession(auth.config, sessionId, row.userId);
  return true;
}

/**
 * Revoke every session for a user except the one given. Useful for
 * "sign out all other devices" — the caller's session is preserved.
 */
export async function revokeAllOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.id, keepSessionId),
        isNull(sessions.revokedAt),
      ),
    );
  let n = 0;
  for (const r of rows) {
    await coreRevokeSession(auth.config, r.id, userId);
    n++;
  }
  return n;
}
