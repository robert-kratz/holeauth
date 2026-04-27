/**
 * Integration-style tests for plugin-idp's public API, routes, and hooks.
 *
 * Uses a fully in-memory IdpAdapter and a mocked PluginContext so we can
 * drive every branch without a database.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HoleauthConfig } from '@holeauth/core';
import type { PluginContext, PluginRouteContext } from '@holeauth/core/plugins';
import type { AdapterUser } from '@holeauth/core/adapters';

import {
  idp,
  createMemoryRateLimiter,
  type IdpAdapter,
  type IdpApi,
  type IdpApp,
  type IdpAuthorizationCode,
  type IdpRefreshToken,
  type IdpSigningKey,
  type IdpTeam,
  type IdpTeamMember,
  type TeamRole,
} from '../src/index.js';
import { sha256Hex } from '../src/jwt.js';

/* ────────────────── mocks ────────────────── */

vi.mock('@holeauth/core/session', () => ({
  revokeSession: vi.fn(async () => {}),
}));

/* ────────────────── in-memory IdpAdapter ────────────────── */

interface MemoryStore {
  teams: Map<string, IdpTeam>;
  memberships: IdpTeamMember[];
  apps: Map<string, IdpApp>;
  codes: Map<string, IdpAuthorizationCode>;
  refresh: Map<string, IdpRefreshToken>;
  consents: Map<string, { userId: string; appId: string; scopesGranted: string[]; grantedAt: Date }>;
  keys: Map<string, IdpSigningKey>;
}

function makeAdapter(): IdpAdapter & { store: MemoryStore } {
  const store: MemoryStore = {
    teams: new Map(),
    memberships: [],
    apps: new Map(),
    codes: new Map(),
    refresh: new Map(),
    consents: new Map(),
    keys: new Map(),
  };
  const adapter: IdpAdapter = {
    teams: {
      async create({ name, ownerUserId }) {
        const t: IdpTeam = { id: `team-${store.teams.size + 1}`, name, createdAt: new Date() };
        store.teams.set(t.id, t);
        store.memberships.push({ teamId: t.id, userId: ownerUserId, role: 'owner', addedAt: new Date() });
        return t;
      },
      async getById(id) { return store.teams.get(id) ?? null; },
      async delete(id) {
        store.teams.delete(id);
        store.memberships = store.memberships.filter((m) => m.teamId !== id);
      },
      async listForUser(userId) {
        return store.memberships
          .filter((m) => m.userId === userId)
          .map((m) => ({ ...store.teams.get(m.teamId)!, role: m.role }));
      },
      async listMembers(teamId) {
        return store.memberships.filter((m) => m.teamId === teamId);
      },
      async getMembership(teamId, userId) {
        return store.memberships.find((m) => m.teamId === teamId && m.userId === userId) ?? null;
      },
      async addMember(teamId, userId, role) {
        if (!store.memberships.find((m) => m.teamId === teamId && m.userId === userId)) {
          store.memberships.push({ teamId, userId, role, addedAt: new Date() });
        }
      },
      async removeMember(teamId, userId) {
        store.memberships = store.memberships.filter(
          (m) => !(m.teamId === teamId && m.userId === userId),
        );
      },
    },
    apps: {
      async create(input) {
        const app: IdpApp = {
          id: input.id,
          teamId: input.teamId,
          name: input.name,
          description: input.description ?? null,
          logoUrl: input.logoUrl ?? null,
          type: input.type,
          clientSecretHash: input.clientSecretHash ?? null,
          redirectUris: input.redirectUris,
          allowedScopes: input.allowedScopes,
          requirePkce: input.requirePkce,
          createdAt: new Date(),
          updatedAt: new Date(),
          disabledAt: null,
        };
        store.apps.set(app.id, app);
        return app;
      },
      async getById(id) { return store.apps.get(id) ?? null; },
      async listAll() { return [...store.apps.values()]; },
      async listForTeam(teamId) {
        return [...store.apps.values()].filter((a) => a.teamId === teamId);
      },
      async listForUser(userId) {
        const teamIds = new Set(store.memberships.filter((m) => m.userId === userId).map((m) => m.teamId));
        return [...store.apps.values()].filter((a) => teamIds.has(a.teamId));
      },
      async update(id, patch) {
        const a = store.apps.get(id)!;
        const next: IdpApp = {
          ...a,
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.logoUrl !== undefined && { logoUrl: patch.logoUrl }),
          ...(patch.redirectUris !== undefined && { redirectUris: patch.redirectUris }),
          ...(patch.allowedScopes !== undefined && { allowedScopes: patch.allowedScopes }),
          ...(patch.requirePkce !== undefined && { requirePkce: patch.requirePkce }),
          ...(patch.clientSecretHash !== undefined && { clientSecretHash: patch.clientSecretHash }),
          ...(patch.disabledAt !== undefined && { disabledAt: patch.disabledAt }),
          updatedAt: new Date(),
        };
        store.apps.set(id, next);
        return next;
      },
      async delete(id) { store.apps.delete(id); },
    },
    codes: {
      async create(input) {
        store.codes.set(input.codeHash, {
          codeHash: input.codeHash,
          appId: input.appId,
          userId: input.userId,
          redirectUri: input.redirectUri,
          scope: input.scope,
          nonce: input.nonce,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: input.codeChallengeMethod,
          expiresAt: input.expiresAt,
          consumedAt: null,
        });
      },
      async consume(codeHash) {
        const c = store.codes.get(codeHash);
        if (!c) return null;
        if (c.consumedAt) return null;
        if (c.expiresAt.getTime() < Date.now()) return null;
        c.consumedAt = new Date();
        return c;
      },
    },
    refresh: {
      async create(input) {
        const row: IdpRefreshToken = {
          id: input.id,
          tokenHash: input.tokenHash,
          appId: input.appId,
          userId: input.userId,
          familyId: input.familyId,
          scope: input.scope,
          expiresAt: input.expiresAt,
          createdAt: new Date(),
          revokedAt: null,
        };
        store.refresh.set(row.id, row);
        return row;
      },
      async getByHash(hash) {
        return [...store.refresh.values()].find((r) => r.tokenHash === hash) ?? null;
      },
      async markRevoked(id) {
        const r = store.refresh.get(id);
        if (r) r.revokedAt = new Date();
      },
      async revokeFamily(familyId) {
        for (const r of store.refresh.values()) if (r.familyId === familyId) r.revokedAt = new Date();
      },
      async revokeAllForUser(userId) {
        for (const r of store.refresh.values()) if (r.userId === userId) r.revokedAt = new Date();
      },
      async revokeAllForApp(appId) {
        for (const r of store.refresh.values()) if (r.appId === appId) r.revokedAt = new Date();
      },
      async listForApp(appId) {
        return [...store.refresh.values()].filter((r) => r.appId === appId);
      },
    },
    consent: {
      async get(userId, appId) {
        return store.consents.get(`${userId}:${appId}`) ?? null;
      },
      async upsert(userId, appId, scopesGranted) {
        store.consents.set(`${userId}:${appId}`, { userId, appId, scopesGranted, grantedAt: new Date() });
      },
      async revoke(userId, appId) {
        store.consents.delete(`${userId}:${appId}`);
      },
    },
    keys: {
      async listActive() {
        return [...store.keys.values()].filter((k) => k.active);
      },
      async getActive() {
        return [...store.keys.values()].find((k) => k.active) ?? null;
      },
      async create(input) {
        const k: IdpSigningKey = {
          kid: input.kid,
          alg: input.alg,
          publicJwk: input.publicJwk,
          privateJwk: input.privateJwk,
          active: true,
          createdAt: new Date(),
          rotatedAt: null,
        };
        store.keys.set(k.kid, k);
        return k;
      },
      async markRotated(kid) {
        const k = store.keys.get(kid);
        if (k) { k.active = false; k.rotatedAt = new Date(); }
      },
    },
  };
  return Object.assign(adapter, { store });
}

/* ────────────────── harness ────────────────── */

interface Harness {
  api: IdpApi;
  plugin: ReturnType<typeof idp>;
  ctx: PluginContext;
  adapter: ReturnType<typeof makeAdapter>;
  user: AdapterUser;
  logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  rbacCan: ReturnType<typeof vi.fn>;
  issuer: string;
}

function makeHarness(opts?: {
  rbac?: { can?: (userId: string, node: string) => Promise<boolean> } | null;
  tokenRateLimiter?: ReturnType<typeof createMemoryRateLimiter> | false;
}): Harness {
  const adapter = makeAdapter();
  const user: AdapterUser = {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    image: null,
    emailVerified: new Date(),
  } as unknown as AdapterUser;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = {
    tokens: { cookiePrefix: 'holeauth' },
    adapters: {},
  } as unknown as HoleauthConfig;
  const rbacCan = vi.fn<(userId: string, node: string) => Promise<boolean>>(async () => true);
  const rbacPlugin = opts?.rbac === null ? null : { can: opts?.rbac?.can ?? rbacCan };

  const ctx: PluginContext = {
    config,
    events: { on: () => () => {}, off: () => {}, emit: async () => {} },
    logger,
    core: {
      getUserById: vi.fn(async (id: string) => (id === user.id ? user : null)),
    } as unknown as PluginContext['core'],
    getPlugin: <T,>(id: string) => {
      if (id === 'rbac' && rbacPlugin) return rbacPlugin as unknown as T;
      throw new Error('no plugin');
    },
    getPluginAdapter: <T,>() => adapter as unknown as T,
  };

  const issuer = 'https://idp.example';
  const plugin = idp({
    adapter,
    issuer,
    tokenRateLimiter: opts?.tokenRateLimiter,
  });
  const api = plugin.api(ctx);
  return { api, plugin, ctx, adapter, user, logger, rbacCan, issuer };
}

/* ────────────────── route dispatcher ────────────────── */

function makeRctx(
  plugin: PluginContext,
  req: Request,
  opts: { session?: { userId: string; sessionId: string; expiresAt: number } | null } = {},
): PluginRouteContext {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookieMap = new Map<string, string>();
  for (const part of cookieHeader.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) cookieMap.set(part.slice(0, i), decodeURIComponent(part.slice(i + 1)));
  }
  return {
    req,
    body: {},
    responseHeaders: new Headers(),
    cookies: { get: (n) => cookieMap.get(n) },
    setCookie: () => {},
    getSession: async () => opts.session ?? null,
    meta: {},
    plugin,
  };
}

function routeByPath(
  plugin: ReturnType<typeof idp>,
  method: string,
  path: string,
) {
  const r = plugin.routes!.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`route ${method} ${path} not found`);
  return r;
}

/* ────────────────── constructor ────────────────── */

describe('idp() — factory', () => {
  it('exposes meta + issuer', () => {
    const h = makeHarness();
    expect(h.api.meta.issuer).toBe('https://idp.example');
    expect(h.api.meta.scopesSupported).toContain('openid');
  });

  it('exposes adapter escape hatch', () => {
    const h = makeHarness();
    expect(h.api.adapter).toBe(h.adapter);
  });
});

/* ────────────────── apps.create / rbac gate ────────────────── */

describe('apps.create', () => {
  it('creates a confidential app and returns a client_secret exactly once', async () => {
    const h = makeHarness();
    const { app, clientSecret } = await h.api.apps.create('user-1', {
      name: 'My App',
      type: 'confidential',
      redirectUris: ['https://rp/cb'],
    });
    expect(app.type).toBe('confidential');
    expect(clientSecret).toBeTruthy();
    expect(app.clientSecretHash).toBe(await sha256Hex(clientSecret!));
  });

  it('creates a public app with no secret', async () => {
    const h = makeHarness();
    const { clientSecret } = await h.api.apps.create('user-1', {
      name: 'P', type: 'public', redirectUris: ['https://rp/cb'],
    });
    expect(clientSecret).toBeUndefined();
  });

  it('auto-creates a personal team when none is given', async () => {
    const h = makeHarness();
    const { app } = await h.api.apps.create('user-1', {
      name: 'P', type: 'public', redirectUris: ['https://rp/cb'],
    });
    const t = h.adapter.store.teams.get(app.teamId)!;
    expect(t.name).toContain("alice@example.com");
  });

  it('reuses an existing owner-team', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'Existing');
    const { app } = await h.api.apps.create('user-1', {
      name: 'P', type: 'public', redirectUris: ['https://rp/cb'],
    });
    expect(app.teamId).toBe(t.id);
  });

  it('falls back to userId-based team name when user has no email', async () => {
    const h = makeHarness();
    (h.ctx.core.getUserById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { app } = await h.api.apps.create('longuseridvalue', {
      name: 'P', type: 'public', redirectUris: ['https://rp/cb'],
    });
    const t = h.adapter.store.teams.get(app.teamId)!;
    expect(t.name).toContain('longuser');
  });

  it('uses the provided teamId when caller is a member', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    const { app } = await h.api.apps.create('user-1', {
      name: 'P', type: 'public', redirectUris: ['https://rp/cb'], teamId: t.id,
    });
    expect(app.teamId).toBe(t.id);
  });

  it('rejects when caller is not a member of the provided team', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('someone-else', 'T');
    await expect(
      h.api.apps.create('user-1', {
        name: 'P', type: 'public', redirectUris: [], teamId: t.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies creation when rbac.can returns false', async () => {
    const h = makeHarness({ rbac: { can: async () => false } });
    await expect(
      h.api.apps.create('user-1', { name: 'N', type: 'public', redirectUris: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows creation when no rbac plugin is installed', async () => {
    const h = makeHarness({ rbac: null });
    const r = await h.api.apps.create('user-1', { name: 'N', type: 'public', redirectUris: [] });
    expect(r.app.id).toBeTruthy();
  });
});

/* ────────────────── apps.get / update / delete / regenerateSecret ────────────────── */

describe('apps.get / update / delete / regenerateSecret', () => {
  let h: Harness;
  let appId: string;
  beforeEach(async () => {
    h = makeHarness();
    const r = await h.api.apps.create('user-1', {
      name: 'A', type: 'confidential', redirectUris: ['https://rp/cb'],
    });
    appId = r.app.id;
  });

  it('get returns the app for a team member', async () => {
    const a = await h.api.apps.get('user-1', appId);
    expect(a.id).toBe(appId);
  });

  it('get rejects non-members with 403', async () => {
    await expect(h.api.apps.get('other', appId)).rejects.toMatchObject({ status: 403 });
  });

  it('get returns NOT_FOUND for a missing app', async () => {
    await expect(h.api.apps.get('user-1', 'ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update requires owner role', async () => {
    // Add non-owner and ensure they cannot update.
    const t = (await h.api.teams.listForUser('user-1'))[0]!;
    await h.api.teams.addMember('user-1', t.id, 'dev-1', 'developer');
    await expect(
      h.api.apps.update('dev-1', appId, { name: 'New' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('update toggles disabled flag both ways', async () => {
    const a1 = await h.api.apps.update('user-1', appId, { disabled: true });
    expect(a1.disabledAt).toBeInstanceOf(Date);
    const a2 = await h.api.apps.update('user-1', appId, { disabled: false });
    expect(a2.disabledAt).toBeNull();
  });

  it('admin=true lets an admin update apps they do not own', async () => {
    const ha = makeHarness({ rbac: { can: async (_u, n) => n === 'idp.apps.admin' } });
    const app = await ha.adapter.apps.create({
      id: 'a1', teamId: 't1', name: 'A', type: 'public',
      redirectUris: [], allowedScopes: [], requirePkce: true,
    });
    const r = await ha.api.apps.update('stranger', app.id, { name: 'Renamed' }, { admin: true });
    expect(r.name).toBe('Renamed');
  });

  it('regenerateSecret returns a new secret for confidential apps', async () => {
    const r = await h.api.apps.regenerateSecret('user-1', appId);
    expect(r.clientSecret).toBeTruthy();
  });

  it('regenerateSecret rejects public apps', async () => {
    const { app } = await h.api.apps.create('user-1', {
      name: 'pub', type: 'public', redirectUris: [],
    });
    await expect(h.api.apps.regenerateSecret('user-1', app.id)).rejects.toMatchObject({
      code: 'INVALID',
    });
  });

  it('delete revokes refresh tokens and removes the app', async () => {
    await h.adapter.refresh.create({
      id: 'rt1', tokenHash: 'h', appId, userId: 'u', familyId: 'f',
      scope: 'openid', expiresAt: new Date(Date.now() + 10_000),
    });
    await h.api.apps.delete('user-1', appId);
    expect(h.adapter.store.apps.has(appId)).toBe(false);
    expect(h.adapter.store.refresh.get('rt1')?.revokedAt).toBeInstanceOf(Date);
  });

  it('listForUser / listAll return expected sets', async () => {
    expect((await h.api.apps.listForUser('user-1')).length).toBe(1);
    expect((await h.api.apps.listAll()).length).toBeGreaterThan(0);
  });
});

/* ────────────────── teams ────────────────── */

describe('teams API', () => {
  it('create + listForUser', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    const list = await h.api.teams.listForUser('user-1');
    expect(list[0]!.id).toBe(t.id);
  });

  it('listMembers requires membership', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    await expect(h.api.teams.listMembers('stranger', t.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const members = await h.api.teams.listMembers('user-1', t.id);
    expect(members.length).toBe(1);
  });

  it('addMember requires owner role', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    await h.api.teams.addMember('user-1', t.id, 'dev-1', 'developer');
    await expect(
      h.api.teams.addMember('dev-1', t.id, 'u2', 'developer' as TeamRole),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('removeMember prevents removing the last owner', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    await expect(
      h.api.teams.removeMember('user-1', t.id, 'user-1'),
    ).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('removeMember allows removing a non-sole owner', async () => {
    const h = makeHarness();
    const t = await h.api.teams.create('user-1', 'T');
    await h.api.teams.addMember('user-1', t.id, 'dev-1', 'developer');
    await h.api.teams.removeMember('user-1', t.id, 'dev-1');
    expect(await h.api.teams.listMembers('user-1', t.id)).toHaveLength(1);
  });
});

/* ────────────────── tokens admin API ────────────────── */

describe('tokens API', () => {
  it('listForApp / revokeAllForApp gated by owner role', async () => {
    const h = makeHarness();
    const { app } = await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: [],
    });
    await h.adapter.refresh.create({
      id: 'x', tokenHash: 'h', appId: app.id, userId: 'u', familyId: 'f',
      scope: 's', expiresAt: new Date(Date.now() + 10_000),
    });
    await expect(
      h.api.tokens.listForApp('stranger', app.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await h.api.tokens.listForApp('user-1', app.id)).toHaveLength(1);
    await h.api.tokens.revokeAllForApp('user-1', app.id);
    expect(h.adapter.store.refresh.get('x')?.revokedAt).toBeInstanceOf(Date);
  });
});

/* ────────────────── keys API ────────────────── */

describe('keys API', () => {
  it('bootstrap creates then reuses the same active key', async () => {
    const h = makeHarness();
    const k1 = await h.api.keys.bootstrap();
    const k2 = await h.api.keys.bootstrap();
    expect(k1.kid).toBe(k2.kid);
  });

  it('rotate creates a new active key', async () => {
    const h = makeHarness();
    const k1 = await h.api.keys.bootstrap();
    const k2 = await h.api.keys.rotate();
    expect(k2.kid).not.toBe(k1.kid);
  });
});

/* ────────────────── discovery + JWKS ────────────────── */

describe('route: /.well-known/openid-configuration', () => {
  it('returns a well-formed discovery document', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/.well-known/openid-configuration');
    const rctx = makeRctx(h.ctx, new Request('https://idp.example/.well-known/openid-configuration'));
    const res = await route.handler(rctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe('https://idp.example');
    expect(body.token_endpoint).toMatch(/\/oauth2\/token$/);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
  });
});

describe('route: /oauth2/jwks', () => {
  it('returns active keys', async () => {
    const h = makeHarness();
    await h.api.keys.bootstrap();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/jwks');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/jwks')));
    const body = (await res.json()) as { keys: unknown[] };
    expect(body.keys).toHaveLength(1);
  });
});

/* ────────────────── /oauth2/authorize (GET) ────────────────── */

describe('route: GET /oauth2/authorize', () => {
  async function makeApp(h: Harness, extra: Partial<Parameters<typeof h.api.apps.create>[1]> = {}) {
    const r = await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: ['https://rp/cb'],
      allowedScopes: ['openid', 'profile', 'email'],
      requirePkce: true,
      ...extra,
    });
    return r.app;
  }
  function authReq(qs: Record<string, string>) {
    const u = new URL('https://idp.example/oauth2/authorize');
    for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
    return new Request(u);
  }

  it('rejects non-code response_type', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({ response_type: 'token' })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('unsupported_response_type');
  });

  it('rejects missing client_id', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({ response_type: 'code' })));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('rejects unknown client', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: 'ghost', redirect_uri: 'x',
    })));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_client');
  });

  it('rejects unknown redirect_uri', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://evil',
    })));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('requires PKCE for public/requirePkce clients', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
    })));
    const j = (await res.json()) as { error: string; error_description: string };
    expect(j.error).toBe('invalid_request');
    expect(j.error_description).toMatch(/PKCE/);
  });

  it('rejects non-S256 PKCE method', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
      code_challenge: 'cc', code_challenge_method: 'plain',
    })));
    expect(((await res.json()) as { error_description: string }).error_description).toMatch(/S256/);
  });

  it('302s to /login when unauthenticated', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
      code_challenge: 'cc',
    }), { session: null }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/^\/login\?returnTo=/);
  });

  it('returns invalid_scope when no requested scopes are granted', async () => {
    const h = makeHarness();
    const app = await makeApp(h, { allowedScopes: ['openid'] });
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
      code_challenge: 'cc', scope: 'profile email',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_scope');
  });

  it('renders consent page when no remembered consent exists', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
      code_challenge: 'cc', scope: 'openid profile',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(res.headers.get('content-type')).toMatch(/html/);
    expect(await res.text()).toContain('wants to access your account');
  });

  it('auto-issues code when remembered consent covers requested scopes', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    await h.adapter.consent.upsert('user-1', app.id, ['openid', 'profile']);
    const route = routeByPath(h.plugin, 'GET', '/oauth2/authorize');
    const res = await route.handler(makeRctx(h.ctx, authReq({
      response_type: 'code', client_id: app.id, redirect_uri: 'https://rp/cb',
      code_challenge: 'cc', scope: 'openid profile', state: 'xyz',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('code')).toBeTruthy();
    expect(loc.searchParams.get('state')).toBe('xyz');
  });
});

/* ────────────────── /oauth2/authorize/consent (POST) ────────────────── */

describe('route: POST /oauth2/authorize/consent', () => {
  async function makeApp(h: Harness) {
    return (await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: ['https://rp/cb'],
      allowedScopes: ['openid', 'profile'],
    })).app;
  }

  function consentReq(body: Record<string, string>, withCsrfCookie = true) {
    const form = new URLSearchParams(body).toString();
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (withCsrfCookie) headers.cookie = 'holeauth.csrf=csrf-token';
    return new Request('https://idp.example/oauth2/authorize/consent', {
      method: 'POST', body: form, headers,
    });
  }

  it('rejects when CSRF is missing/mismatched', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'POST', '/oauth2/authorize/consent');
    const res = await route.handler(makeRctx(h.ctx, consentReq({ csrfToken: 'wrong' })));
    expect(((await res.json()) as { error_description: string }).error_description).toMatch(/CSRF/);
  });

  it('rejects when unauthenticated', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'POST', '/oauth2/authorize/consent');
    const res = await route.handler(
      makeRctx(h.ctx, consentReq({ csrfToken: 'csrf-token' }), { session: null }),
    );
    expect(res.status).toBe(401);
  });

  it('302s with error=access_denied when user denies', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/authorize/consent');
    const res = await route.handler(makeRctx(h.ctx, consentReq({
      csrfToken: 'csrf-token', client_id: app.id, redirect_uri: 'https://rp/cb',
      scope: 'openid', decision: 'deny', state: 'X',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('access_denied');
  });

  it('persists consent + issues code on approve', async () => {
    const h = makeHarness();
    const app = await makeApp(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/authorize/consent');
    const res = await route.handler(makeRctx(h.ctx, consentReq({
      csrfToken: 'csrf-token', client_id: app.id, redirect_uri: 'https://rp/cb',
      scope: 'openid profile', decision: 'approve',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(res.status).toBe(302);
    expect(h.adapter.store.consents.get(`user-1:${app.id}`)).toBeTruthy();
  });

  it('rejects unknown client / redirect_uri', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'POST', '/oauth2/authorize/consent');
    const r1 = await route.handler(makeRctx(h.ctx, consentReq({
      csrfToken: 'csrf-token', client_id: 'ghost', redirect_uri: 'https://rp/cb',
      scope: 'openid', decision: 'approve',
    }), { session: { userId: 'user-1', sessionId: 's', expiresAt: Date.now() + 1e6 } }));
    expect(((await r1.json()) as { error: string }).error).toBe('invalid_client');
  });
});

/* ────────────────── /oauth2/token ────────────────── */

describe('route: POST /oauth2/token', () => {
  async function setupCode(h: Harness, opts: { pkce?: boolean; secret?: string } = {}) {
    const { app, clientSecret } = await h.api.apps.create('user-1', {
      name: 'A', type: opts.secret ? 'confidential' : 'public',
      redirectUris: ['https://rp/cb'],
      allowedScopes: ['openid', 'profile', 'offline_access'],
      requirePkce: opts.pkce !== false,
    });
    const verifier = 'v'.repeat(50);
    const { s256Challenge } = await import('../src/pkce.js');
    const challenge = await s256Challenge(verifier);
    const code = 'codeABC';
    await h.adapter.codes.create({
      codeHash: await sha256Hex(code),
      appId: app.id, userId: 'user-1',
      redirectUri: 'https://rp/cb', scope: 'openid profile offline_access',
      nonce: 'n-1',
      codeChallenge: opts.pkce === false ? null : challenge,
      codeChallengeMethod: opts.pkce === false ? null : 'S256',
      expiresAt: new Date(Date.now() + 60_000),
    });
    return { app, clientSecret, code, verifier };
  }

  function tokenReq(body: Record<string, string>, basic?: { u: string; p: string }) {
    const form = new URLSearchParams(body).toString();
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (basic) headers.authorization = 'Basic ' + btoa(`${basic.u}:${basic.p}`);
    return new Request('https://idp.example/oauth2/token', {
      method: 'POST', body: form, headers,
    });
  }

  it('authorization_code success → returns AT/IDT/RT', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, code_verifier: verifier,
    })));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.access_token).toBeTruthy();
    expect(body.id_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe('Bearer');
  });

  it('rejects wrong client_secret (confidential)', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h, { secret: 'yes' });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, client_secret: 'nope', code_verifier: verifier,
    })));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_client');
  });

  it('accepts Basic auth for confidential clients', async () => {
    const h = makeHarness();
    const { app, clientSecret, code, verifier } = await setupCode(h, { secret: 'yes' });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb', code_verifier: verifier,
    }, { u: app.id, p: clientSecret! })));
    expect(res.status).toBe(200);
  });

  it('rejects reused authorization code', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const body = { grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb', client_id: app.id, code_verifier: verifier };
    await route.handler(makeRctx(h.ctx, tokenReq(body)));
    const res = await route.handler(makeRctx(h.ctx, tokenReq(body)));
    expect(((await res.json()) as { error: string }).error).toBe('invalid_grant');
  });

  it('rejects when redirect_uri mismatches the stored code', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    // Add another redirect so authenticateClient succeeds but code check fails
    await h.adapter.apps.update(app.id, { redirectUris: ['https://rp/cb', 'https://rp/alt'] });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/alt',
      client_id: app.id, code_verifier: verifier,
    })));
    expect(((await res.json()) as { error_description: string }).error_description).toMatch(/redirect_uri/);
  });

  it('rejects PKCE mismatch', async () => {
    const h = makeHarness();
    const { app, code } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, code_verifier: 'wrong',
    })));
    expect(((await res.json()) as { error_description: string }).error_description).toMatch(/PKCE/);
  });

  it('rejects missing code_verifier when code carries a challenge', async () => {
    const h = makeHarness();
    const { app, code } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb', client_id: app.id,
    })));
    expect(((await res.json()) as { error_description: string }).error_description).toMatch(/code_verifier/);
  });

  it('rejects missing code param', async () => {
    const h = makeHarness();
    const { app } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', redirect_uri: 'https://rp/cb', client_id: app.id,
    })));
    expect(res.status).toBe(400);
  });

  it('unsupported_grant_type for unknown grant', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const res = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'password', client_id: 'x',
    })));
    expect(((await res.json()) as { error: string }).error).toMatch(/invalid_client|unsupported_grant_type/);
  });

  it('refresh_token happy path rotates the token', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const r1 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, code_verifier: verifier,
    })));
    const b1 = (await r1.json()) as Record<string, string>;
    const r2 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: b1.refresh_token!, client_id: app.id,
    })));
    const b2 = (await r2.json()) as Record<string, string>;
    expect(b2.refresh_token).toBeTruthy();
    expect(b2.refresh_token).not.toBe(b1.refresh_token);
  });

  it('refresh_token reuse detection revokes family', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const r1 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, code_verifier: verifier,
    })));
    const b1 = (await r1.json()) as Record<string, string>;
    // Rotate
    await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: b1.refresh_token!, client_id: app.id,
    })));
    // Reuse the original
    const rx = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: b1.refresh_token!, client_id: app.id,
    })));
    expect(((await rx.json()) as { error_description: string }).error_description).toMatch(/reused/);
  });

  it('refresh_token cross-client use revokes family', async () => {
    const h = makeHarness();
    const { app, code, verifier } = await setupCode(h);
    const { app: appB } = await h.api.apps.create('user-1', {
      name: 'B', type: 'public', redirectUris: ['https://rp/cb'],
    });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const r1 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'authorization_code', code, redirect_uri: 'https://rp/cb',
      client_id: app.id, code_verifier: verifier,
    })));
    const b1 = (await r1.json()) as Record<string, string>;
    const rx = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: b1.refresh_token!, client_id: appB.id,
    })));
    expect(((await rx.json()) as { error_description: string }).error_description).toMatch(/wrong client/);
  });

  it('refresh_token unknown / expired / missing', async () => {
    const h = makeHarness();
    const { app } = await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: [],
    });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const r0 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', client_id: app.id,
    })));
    expect(res400(r0)).toBe(true);
    const r1 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: 'ghost', client_id: app.id,
    })));
    expect(((await r1.json()) as { error_description: string }).error_description).toMatch(/unknown/);
    // expired
    await h.adapter.refresh.create({
      id: 'x', tokenHash: await sha256Hex('exp-rt'), appId: app.id, userId: 'u',
      familyId: 'f', scope: 'openid', expiresAt: new Date(Date.now() - 1000),
    });
    const r2 = await route.handler(makeRctx(h.ctx, tokenReq({
      grant_type: 'refresh_token', refresh_token: 'exp-rt', client_id: app.id,
    })));
    expect(((await r2.json()) as { error_description: string }).error_description).toMatch(/expired/);
  });

  it('rate limits token endpoint after too many attempts', async () => {
    const limiter = createMemoryRateLimiter({ max: 2, windowSeconds: 60 });
    const h = makeHarness({ tokenRateLimiter: limiter });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/token');
    const body = { grant_type: 'authorization_code', client_id: 'x' };
    await route.handler(makeRctx(h.ctx, tokenReq(body)));
    await route.handler(makeRctx(h.ctx, tokenReq(body)));
    const res = await route.handler(makeRctx(h.ctx, tokenReq(body)));
    expect(res.status).toBe(429);
  });
});

function res400(r: Response): boolean {
  return r.status === 400;
}

/* ────────────────── /oauth2/userinfo ────────────────── */

describe('route: GET /oauth2/userinfo', () => {
  it('returns 401 without bearer token', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/userinfo');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/userinfo')));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('returns 401 on invalid bearer', async () => {
    const h = makeHarness();
    await h.api.keys.bootstrap();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/userinfo');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/userinfo', {
      headers: { authorization: 'Bearer not-a-jwt' },
    })));
    expect(res.status).toBe(401);
  });

  it('returns user claims on valid bearer', async () => {
    const h = makeHarness();
    const key = await h.api.keys.bootstrap();
    const { signAccessToken } = await import('../src/jwt.js');
    const { token } = await signAccessToken(key, {
      issuer: 'https://idp.example', audience: 'c', subject: 'user-1',
      ttlSeconds: 300, scope: 'openid profile email',
    });
    const route = routeByPath(h.plugin, 'GET', '/oauth2/userinfo');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    })));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sub).toBe('user-1');
    expect(body.email).toBe('alice@example.com');
  });

  it('returns 401 when user no longer exists', async () => {
    const h = makeHarness();
    (h.ctx.core.getUserById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const key = await h.api.keys.bootstrap();
    const { signAccessToken } = await import('../src/jwt.js');
    const { token } = await signAccessToken(key, {
      issuer: 'https://idp.example', audience: 'c', subject: 'ghost',
      ttlSeconds: 300, scope: 'openid',
    });
    const route = routeByPath(h.plugin, 'GET', '/oauth2/userinfo');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    })));
    expect(res.status).toBe(401);
  });
});

/* ────────────────── /oauth2/revoke ────────────────── */

describe('route: POST /oauth2/revoke', () => {
  it('200s with no token param', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'POST', '/oauth2/revoke');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/revoke', {
      method: 'POST', body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })));
    expect(res.status).toBe(200);
  });

  it('revokes the refresh token', async () => {
    const h = makeHarness();
    const { app } = await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: [],
    });
    const raw = 'r-raw';
    await h.adapter.refresh.create({
      id: 'id1', tokenHash: await sha256Hex(raw), appId: app.id, userId: 'u',
      familyId: 'f', scope: 'openid', expiresAt: new Date(Date.now() + 1e5),
    });
    const route = routeByPath(h.plugin, 'POST', '/oauth2/revoke');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/revoke', {
      method: 'POST',
      body: new URLSearchParams({ client_id: app.id, token: raw }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })));
    expect(res.status).toBe(200);
    expect(h.adapter.store.refresh.get('id1')?.revokedAt).toBeInstanceOf(Date);
  });
});

/* ────────────────── /oauth2/end-session ────────────────── */

describe('route: GET /oauth2/end-session', () => {
  it('302s to post_logout_redirect_uri when provided', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/end-session');
    const res = await route.handler(makeRctx(h.ctx, new Request(
      'https://idp.example/oauth2/end-session?post_logout_redirect_uri=https%3A%2F%2Frp%2Fbye',
    )));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://rp/bye');
  });

  it('302s to / when no redirect given', async () => {
    const h = makeHarness();
    const route = routeByPath(h.plugin, 'GET', '/oauth2/end-session');
    const res = await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/end-session')));
    expect(res.headers.get('location')).toBe('/');
  });

  it('revokes the session when one exists', async () => {
    const h = makeHarness();
    const { revokeSession } = await import('@holeauth/core/session');
    const route = routeByPath(h.plugin, 'GET', '/oauth2/end-session');
    await route.handler(makeRctx(h.ctx, new Request('https://idp.example/oauth2/end-session'), {
      session: { userId: 'user-1', sessionId: 'sid', expiresAt: Date.now() + 1e6 },
    }));
    expect(revokeSession).toHaveBeenCalled();
  });
});

/* ────────────────── userDelete hook ────────────────── */

describe('hooks.userDelete.after', () => {
  it('revokes all refresh tokens for the user', async () => {
    const h = makeHarness();
    const { app } = await h.api.apps.create('user-1', {
      name: 'A', type: 'public', redirectUris: [],
    });
    await h.adapter.refresh.create({
      id: 'r1', tokenHash: 'x', appId: app.id, userId: 'user-1',
      familyId: 'f', scope: 's', expiresAt: new Date(Date.now() + 1e5),
    });
    const hook = h.plugin.hooks!.userDelete!.after!;
    await hook({ userId: 'user-1' } as unknown as Parameters<typeof hook>[0], h.ctx);
    expect(h.adapter.store.refresh.get('r1')?.revokedAt).toBeInstanceOf(Date);
  });

  it('logs on adapter failure', async () => {
    const h = makeHarness();
    const spy = vi.spyOn(h.adapter.refresh, 'revokeAllForUser').mockRejectedValueOnce(new Error('db'));
    const hook = h.plugin.hooks!.userDelete!.after!;
    await hook({ userId: 'user-1' } as unknown as Parameters<typeof hook>[0], h.ctx);
    expect(h.logger.error).toHaveBeenCalled();
    spy.mockRestore();
  });
});
