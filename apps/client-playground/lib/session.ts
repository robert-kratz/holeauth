import 'server-only';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '@/db/client';
import { clientSessions, clientUsers } from '@/db/schema';
import { refresh as oidcRefresh, revokeToken } from './oidc';

export const SESSION_COOKIE = 'clientpg.sid';

function sid(): string {
  return randomBytes(24).toString('base64url');
}

export async function createSession(args: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresInSec: number;
  refreshExpiresInSec?: number;
}): Promise<string> {
  const id = sid();
  const now = Date.now();
  const accessExpiresAt = new Date(now + args.expiresInSec * 1000);
  const refreshExpiresAt = args.refreshExpiresInSec
    ? new Date(now + args.refreshExpiresInSec * 1000)
    : null;
  await db.insert(clientSessions).values({
    id,
    userId: args.userId,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken ?? null,
    idToken: args.idToken ?? null,
    accessExpiresAt,
    refreshExpiresAt,
  });
  return id;
}

export async function setSessionCookie(id: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: id,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set({ name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
}

export interface ActiveSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  };
}

export async function getCurrentSession(): Promise<ActiveSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const row = await db.query.clientSessions.findFirst({
    where: eq(clientSessions.id, raw),
  });
  if (!row) return null;
  const user = await db.query.clientUsers.findFirst({
    where: eq(clientUsers.id, row.userId),
  });
  if (!user) return null;
  return {
    id: row.id,
    userId: row.userId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    idToken: row.idToken,
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
    user: {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
    },
  };
}

/** Rotate tokens via refresh_token grant and update the DB row. */
export async function refreshCurrentSession(): Promise<ActiveSession | null> {
  const cur = await getCurrentSession();
  if (!cur?.refreshToken) return cur;
  const tokens = await oidcRefresh(cur.refreshToken);
  const now = Date.now();
  const accessExpiresAt = new Date(now + tokens.expires_in * 1000);
  await db
    .update(clientSessions)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? cur.refreshToken,
      idToken: tokens.id_token ?? cur.idToken,
      accessExpiresAt,
    })
    .where(eq(clientSessions.id, cur.id));
  return getCurrentSession();
}

export async function destroyCurrentSession(): Promise<{ idTokenHint: string | null }> {
  const cur = await getCurrentSession();
  if (!cur) return { idTokenHint: null };
  if (cur.refreshToken) {
    try {
      await revokeToken(cur.refreshToken, 'refresh_token');
    } catch {
      // best-effort
    }
  }
  await db.delete(clientSessions).where(eq(clientSessions.id, cur.id));
  await clearSessionCookie();
  return { idTokenHint: cur.idToken };
}
