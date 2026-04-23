import { describe, it, expect } from 'vitest';
import type {
  UserAdapter,
  SessionAdapter,
  AuditLogAdapter,
  AdapterSession,
  AdapterUser,
  AdapterAuditEvent,
} from '../src/adapters/index.js';
import type { HoleauthConfig } from '../src/types/index.js';
import { issueSession } from '../src/session/issue.js';
import { rotateRefresh } from '../src/session/rotate.js';
import { validateSession } from '../src/session/validate.js';
import { RefreshReuseError } from '../src/errors/index.js';

function makeConfig(): { cfg: HoleauthConfig; audit: AdapterAuditEvent[]; sessions: Map<string, AdapterSession> } {
  const sessions = new Map<string, AdapterSession>();
  const users = new Map<string, AdapterUser>();
  const audit: AdapterAuditEvent[] = [];

  const user: AdapterUser = { id: 'u1', email: 'a@b.com' };
  users.set(user.id, user);

  const userAdapter: UserAdapter = {
    async getUserById(id) { return users.get(id) ?? null; },
    async getUserByEmail(email) { return [...users.values()].find((u) => u.email === email) ?? null; },
    async createUser(d) { const u = { id: crypto.randomUUID(), ...d }; users.set(u.id, u); return u; },
    async updateUser(id, p) { const u = users.get(id)!; const n = { ...u, ...p }; users.set(id, n); return n; },
    async deleteUser(id) { users.delete(id); },
  };
  const sessionAdapter: SessionAdapter = {
    async createSession(d) { sessions.set(d.id, d); return d; },
    async getSession(id) { return sessions.get(id) ?? null; },
    async getByRefreshHash(h) { return [...sessions.values()].find((s) => s.refreshTokenHash === h && !s.revokedAt) ?? null; },
    async findByFamily(f) { return [...sessions.values()].filter((s) => s.familyId === f); },
    async deleteSession(id) { sessions.delete(id); },
    async rotateRefresh(id, h, exp) {
      const s = sessions.get(id)!; const n: AdapterSession = { ...s, refreshTokenHash: h, expiresAt: exp };
      sessions.set(id, n); return n;
    },
    async revokeFamily(f) {
      for (const s of sessions.values()) if (s.familyId === f) sessions.set(s.id, { ...s, revokedAt: new Date() });
    },
  };
  const auditLog: AuditLogAdapter = { async record(e) { audit.push(e); } };
  const cfg: HoleauthConfig = {
    secrets: { jwtSecret: 'test-secret-at-least-32-chars-long-01' },
    adapters: { user: userAdapter, session: sessionAdapter, auditLog },
  };
  return { cfg, audit, sessions };
}

describe('session rotation + reuse detection', () => {
  it('issues and validates tokens', async () => {
    const { cfg } = makeConfig();
    const t = await issueSession(cfg, { userId: 'u1' });
    const s = await validateSession(cfg, t.accessToken);
    expect(s?.userId).toBe('u1');
    expect(s?.sessionId).toBe(t.sessionId);
  });

  it('rotates refresh tokens with new hash', async () => {
    const { cfg, sessions } = makeConfig();
    const t1 = await issueSession(cfg, { userId: 'u1' });
    const oldHash = sessions.get(t1.sessionId)!.refreshTokenHash;
    const t2 = await rotateRefresh(cfg, t1.refreshToken);
    const newHash = sessions.get(t2.sessionId)!.refreshTokenHash;
    expect(newHash).not.toBe(oldHash);
    expect(t2.refreshToken).not.toBe(t1.refreshToken);
    expect(t2.sessionId).toBe(t1.sessionId); // same session
    expect(t2.familyId).toBe(t1.familyId);
  });

  it('detects refresh reuse and revokes the whole family', async () => {
    const { cfg, audit, sessions } = makeConfig();
    const t1 = await issueSession(cfg, { userId: 'u1' });
    await rotateRefresh(cfg, t1.refreshToken); // t1 is now stale
    await expect(rotateRefresh(cfg, t1.refreshToken)).rejects.toBeInstanceOf(RefreshReuseError);

    // Entire family should be revoked.
    const fam = [...sessions.values()].filter((s) => s.familyId === t1.familyId);
    expect(fam.every((s) => s.revokedAt)).toBe(true);
    expect(audit.some((e) => e.type === 'session.reuse_detected')).toBe(true);
  });
});
