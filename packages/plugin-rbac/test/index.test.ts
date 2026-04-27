/**
 * Integration-style tests for plugin-rbac's public API, routes, and hooks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  HoleauthConfig,
} from '@holeauth/core';
import type {
  PluginContext,
  PluginRouteContext,
} from '@holeauth/core/plugins';

import {
  rbac,
  type GroupDefinition,
  type RbacAdapter,
  type RbacApi,
  type UserGroupAssignment,
} from '../src/index.js';

/* ────────────────── in-memory adapter ────────────────── */

function makeAdapter(): RbacAdapter & {
  groups: Map<string, Set<string>>;
  perms: Map<string, Set<string>>;
} {
  const groups = new Map<string, Set<string>>();
  const perms = new Map<string, Set<string>>();
  return {
    groups,
    perms,
    async listUserGroups(userId) {
      return [...(groups.get(userId) ?? new Set())];
    },
    async assignGroup(userId, groupId) {
      const s = groups.get(userId) ?? new Set();
      s.add(groupId);
      groups.set(userId, s);
    },
    async removeGroup(userId, groupId) {
      groups.get(userId)?.delete(groupId);
    },
    async listUserPermissions(userId) {
      return [...(perms.get(userId) ?? new Set())];
    },
    async grantPermission(userId, node) {
      const s = perms.get(userId) ?? new Set();
      s.add(node);
      perms.set(userId, s);
    },
    async revokePermission(userId, node) {
      perms.get(userId)?.delete(node);
    },
    async listAllGroupAssignments(): Promise<UserGroupAssignment[]> {
      const out: UserGroupAssignment[] = [];
      for (const [userId, set] of groups) {
        for (const groupId of set) out.push({ userId, groupId });
      }
      return out;
    },
    async purgeUser(userId) {
      groups.delete(userId);
      perms.delete(userId);
    },
  };
}

/* ────────────────── harness ────────────────── */

const GROUPS: GroupDefinition[] = [
  { id: 'user', default: true, effective: ['posts.read', 'profile.*'], priority: 0 },
  { id: 'moderator', effective: ['posts.*', '!posts.delete'], priority: 10 },
  { id: 'admin', effective: ['*'], priority: 100 },
];

interface Harness {
  api: RbacApi;
  plugin: ReturnType<typeof rbac>;
  ctx: PluginContext;
  adapter: ReturnType<typeof makeAdapter>;
  logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
}

function makeHarness(opts?: { withAdapter?: boolean; groups?: GroupDefinition[] }): Harness {
  const adapter = makeAdapter();
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = {
    tokens: { cookiePrefix: 'holeauth' },
    adapters: {},
  } as unknown as HoleauthConfig;
  const ctx: PluginContext = {
    config,
    events: { on: () => () => {}, off: () => {}, emit: async () => {} },
    logger,
    core: {} as unknown as PluginContext['core'],
    getPlugin: <T,>() => api as unknown as T,
    getPluginAdapter: <T,>(_id: string) => (opts?.withAdapter === false ? undefined : (adapter as unknown as T)),
  };
  const plugin = rbac({
    groups: opts?.groups ?? GROUPS,
    adapter: opts?.withAdapter === false ? undefined : adapter,
  });
  const api = plugin.api(ctx);
  return { api, plugin, ctx, adapter, logger };
}

/* ────────────────── constructor / validation ────────────────── */

describe('rbac() — group validation', () => {
  it('throws when no group is marked default', () => {
    expect(() => rbac({ groups: [{ id: 'a', effective: [] }] })).toThrow(/no group has/);
  });

  it('throws when multiple defaults exist', () => {
    expect(() =>
      rbac({
        groups: [
          { id: 'a', default: true, effective: [] },
          { id: 'b', default: true, effective: [] },
        ],
      }),
    ).toThrow(/multiple default/);
  });

  it('throws on duplicate group ids', () => {
    expect(() =>
      rbac({
        groups: [
          { id: 'a', default: true, effective: [] },
          { id: 'a', effective: [] },
        ],
      }),
    ).toThrow(/duplicate group/);
  });
});

/* ────────────────── snapshot / listGroups / getGroup ────────────────── */

describe('rbac.api — snapshot / listGroups / getGroup', () => {
  it('snapshot returns groups + defaultGroupId', () => {
    const h = makeHarness();
    const snap = h.api.snapshot();
    expect(snap.defaultGroupId).toBe('user');
    expect(snap.groups).toHaveLength(3);
  });

  it('listGroups preserves insertion order', () => {
    const h = makeHarness();
    expect(h.api.listGroups().map((g) => g.id)).toEqual(['user', 'moderator', 'admin']);
  });

  it('getGroup returns the group or null', () => {
    const h = makeHarness();
    expect(h.api.getGroup('admin')?.id).toBe('admin');
    expect(h.api.getGroup('ghost')).toBeNull();
  });
});

/* ────────────────── can / canAll / canAny ────────────────── */

describe('rbac.api — can/canAll/canAny', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('default group is applied when user has no explicit assignments', async () => {
    expect(await h.api.can('u1', 'posts.read')).toBe(true);
    expect(await h.api.can('u1', 'posts.delete')).toBe(false);
  });

  it('assigned groups are merged on top of default', async () => {
    await h.adapter.assignGroup('u1', 'moderator');
    expect(await h.api.can('u1', 'posts.edit')).toBe(true);
    // moderator cannot delete
    expect(await h.api.can('u1', 'posts.delete')).toBe(false);
  });

  it('canAll requires every node to pass', async () => {
    await h.adapter.assignGroup('u1', 'admin');
    expect(await h.api.canAll('u1', ['posts.delete', 'profile.anything'])).toBe(true);
  });

  it('canAny returns true when any node passes', async () => {
    expect(await h.api.canAny('u1', ['posts.read', 'admin.tool'])).toBe(true);
    expect(await h.api.canAny('u1', ['admin.tool'])).toBe(false);
  });

  it('rejects invalid userId / node inputs', async () => {
    await expect(h.api.can('', 'x')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
    await expect(h.api.can('u1', '')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
    await expect(h.api.canAll('u1', 'not-array' as unknown as string[])).rejects.toMatchObject({
      code: 'RBAC_INVALID_INPUT',
    });
    await expect(h.api.canAny('u1', 'nope' as unknown as string[])).rejects.toMatchObject({
      code: 'RBAC_INVALID_INPUT',
    });
  });

  it('rejects over-long inputs', async () => {
    await expect(h.api.can('x'.repeat(300), 'p')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
  });
});

/* ────────────────── getUserGroups / getUserPermissions / getEffectiveNodes ────────────────── */

describe('rbac.api — getUserGroups / getUserPermissions / getEffectiveNodes', () => {
  it('getUserGroups always includes the default group', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'moderator');
    const ids = (await h.api.getUserGroups('u1')).map((g) => g.id).sort();
    expect(ids).toEqual(['moderator', 'user']);
  });

  it('getUserPermissions lists direct permission overrides', async () => {
    const h = makeHarness();
    await h.adapter.grantPermission('u1', 'custom.thing');
    expect(await h.api.getUserPermissions('u1')).toContain('custom.thing');
  });

  it('getEffectiveNodes merges group perms + direct perms', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'moderator');
    const nodes = await h.api.getEffectiveNodes('u1');
    expect(nodes).toEqual(expect.arrayContaining(['posts.read', 'posts.*', '!posts.delete']));
  });

  it('getEffectiveNodes warns on orphan groups but still returns known group perms', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'ghost-group');
    const nodes = await h.api.getEffectiveNodes('u1');
    expect(nodes).toEqual(expect.arrayContaining(['posts.read']));
    expect(h.logger.warn).toHaveBeenCalled();
  });
});

/* ────────────────── assignGroup / removeGroup ────────────────── */

describe('rbac.api — assignGroup / removeGroup', () => {
  it('assignGroup validates the group id', async () => {
    const h = makeHarness();
    await expect(h.api.assignGroup('u1', 'ghost')).rejects.toMatchObject({ code: 'RBAC_UNKNOWN_GROUP' });
  });

  it('assignGroup persists and invalidates the cache', async () => {
    const h = makeHarness();
    // prime the cache
    await h.api.getEffectiveNodes('u1');
    await h.api.assignGroup('u1', 'admin');
    expect(h.adapter.groups.get('u1')?.has('admin')).toBe(true);
    expect(await h.api.can('u1', 'admin.tool')).toBe(true);
  });

  it('removeGroup validates the group id', async () => {
    const h = makeHarness();
    await expect(h.api.removeGroup('u1', 'ghost')).rejects.toMatchObject({ code: 'RBAC_UNKNOWN_GROUP' });
  });

  it('removeGroup persists + invalidates', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'admin');
    await h.api.removeGroup('u1', 'admin');
    expect(h.adapter.groups.get('u1')?.has('admin')).toBe(false);
  });

  it('rejects invalid inputs', async () => {
    const h = makeHarness();
    await expect(h.api.assignGroup('', 'admin')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
    await expect(h.api.removeGroup('u1', '')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
  });
});

/* ────────────────── grant / revoke ────────────────── */

describe('rbac.api — grant / revoke', () => {
  it('grant rejects unknown permission nodes', async () => {
    // Use a group set *without* the root `*` wildcard — otherwise every
    // node is trivially "known".
    const h = makeHarness({
      groups: [
        { id: 'user', default: true, effective: ['posts.read', 'profile.*'] },
      ],
    });
    await expect(h.api.grant('u1', 'bogus.thing')).rejects.toMatchObject({
      code: 'RBAC_UNKNOWN_PERMISSION',
    });
  });

  it('grant accepts an exact match of a known pattern', async () => {
    const h = makeHarness();
    await h.api.grant('u1', 'posts.read');
    expect(h.adapter.perms.get('u1')?.has('posts.read')).toBe(true);
  });

  it('grant accepts a wildcard query that covers known patterns', async () => {
    const h = makeHarness();
    await h.api.grant('u1', 'profile.*');
    expect(h.adapter.perms.get('u1')?.has('profile.*')).toBe(true);
  });

  it('grant accepts "*" as long as any known pattern exists', async () => {
    const h = makeHarness();
    await h.api.grant('u1', '*');
    expect(h.adapter.perms.get('u1')?.has('*')).toBe(true);
  });

  it('grant rejects empty/whitespace nodes', async () => {
    const h = makeHarness();
    await expect(h.api.grant('u1', '   ')).rejects.toMatchObject({ code: 'RBAC_UNKNOWN_PERMISSION' });
  });

  it('revoke forwards to the adapter (no known-pattern check)', async () => {
    const h = makeHarness();
    await h.adapter.grantPermission('u1', 'custom.thing');
    await h.api.revoke('u1', 'custom.thing');
    expect(h.adapter.perms.get('u1')?.has('custom.thing')).toBe(false);
  });

  it('revoke rejects invalid inputs', async () => {
    const h = makeHarness();
    await expect(h.api.revoke('', 'x')).rejects.toMatchObject({ code: 'RBAC_INVALID_INPUT' });
  });
});

/* ────────────────── reload ────────────────── */

describe('rbac.api — reload', () => {
  it('reload swaps the group set and clears the cache', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'admin');
    expect(await h.api.can('u1', 'x.y.z')).toBe(true);
    h.api.reload([{ id: 'user', default: true, effective: ['posts.read'] }]);
    // Now admin group is gone (orphan) and user has only posts.read
    expect(await h.api.can('u1', 'x.y.z')).toBe(false);
    expect(await h.api.can('u1', 'posts.read')).toBe(true);
  });

  it('reload throws on invalid group shape', () => {
    const h = makeHarness();
    expect(() => h.api.reload([{ id: 'a', effective: [] }])).toThrow();
  });
});

/* ────────────────── listOrphans ────────────────── */

describe('rbac.api — listOrphans', () => {
  it('returns only assignments whose group id is unknown', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'admin');
    await h.adapter.assignGroup('u2', 'ghost');
    const orphans = await h.api.listOrphans();
    expect(orphans).toEqual([{ userId: 'u2', groupId: 'ghost' }]);
  });
});

/* ────────────────── no-adapter guard ────────────────── */

describe('rbac.api — missing adapter', () => {
  it('throws RBAC_NO_ADAPTER for adapter-backed methods', async () => {
    const h = makeHarness({ withAdapter: false });
    await expect(h.api.can('u1', 'posts.read')).rejects.toMatchObject({ code: 'RBAC_NO_ADAPTER' });
  });
});

/* ────────────────── hooks ────────────────── */

describe('rbac hooks', () => {
  it('register.after assigns the default group', async () => {
    const h = makeHarness();
    await h.plugin.hooks!.register!.after!(
      { id: 'u1', email: 'a@b' } as Parameters<NonNullable<NonNullable<typeof h.plugin.hooks>['register']>['after']>[0],
      h.ctx,
    );
    expect(h.adapter.groups.get('u1')?.has('user')).toBe(true);
  });

  it('register.after logs on adapter failure', async () => {
    const h = makeHarness();
    h.adapter.assignGroup = vi.fn(async () => {
      throw new Error('db offline');
    });
    await h.plugin.hooks!.register!.after!(
      { id: 'u1', email: 'a@b' } as Parameters<NonNullable<NonNullable<typeof h.plugin.hooks>['register']>['after']>[0],
      h.ctx,
    );
    expect(h.logger.error).toHaveBeenCalled();
  });

  it('userDelete.after invalidates cache and purges', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'admin');
    await h.adapter.grantPermission('u1', 'profile.*');
    await h.plugin.hooks!.userDelete!.after!({ userId: 'u1' }, h.ctx);
    expect(h.adapter.groups.get('u1')).toBeUndefined();
    expect(h.adapter.perms.get('u1')).toBeUndefined();
  });

  it('userDelete.after logs adapter failure', async () => {
    const h = makeHarness();
    h.adapter.purgeUser = vi.fn(async () => {
      throw new Error('db offline');
    });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'u1' }, h.ctx);
    expect(h.logger.error).toHaveBeenCalled();
  });
});

/* ────────────────── route: GET /rbac/me ────────────────── */

function makeRctx(overrides: {
  api: RbacApi;
  config: HoleauthConfig;
  session?: { userId: string; sessionId: string; expiresAt: number } | null;
}) {
  const rctx: PluginRouteContext = {
    req: new Request('http://localhost/api/auth/rbac/me'),
    body: {},
    responseHeaders: new Headers(),
    cookies: { get: () => undefined },
    setCookie: () => {},
    getSession: async () =>
      overrides.session === undefined
        ? { userId: 'u1', sessionId: 'SID', expiresAt: Date.now() + 60_000 }
        : overrides.session,
    meta: { ip: '127.0.0.1', userAgent: 'vitest' },
    plugin: {
      config: overrides.config,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      events: { on: () => () => {}, off: () => {}, emit: async () => {} },
      core: {} as unknown as PluginContext['core'],
      getPlugin: <T,>() => overrides.api as unknown as T,
      getPluginAdapter: () => undefined,
    } as unknown as PluginContext,
  };
  return rctx;
}

describe('rbac route — GET /rbac/me', () => {
  it('401 without a session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.ctx.config, session: null });
    const route = h.plugin.routes!.find((r) => r.path === '/rbac/me')!;
    const res = await route.handler!(rctx);
    expect(res.status).toBe(401);
  });

  it('200 with groups + permissions', async () => {
    const h = makeHarness();
    await h.adapter.assignGroup('u1', 'moderator');
    const rctx = makeRctx({ api: h.api, config: h.ctx.config });
    const route = h.plugin.routes!.find((r) => r.path === '/rbac/me')!;
    const res = await route.handler!(rctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual(expect.arrayContaining(['user', 'moderator']));
    expect(body.permissions).toEqual(expect.arrayContaining(['posts.read', 'posts.*']));
  });

  it('500 with RBAC_ERROR on adapter failure', async () => {
    const h = makeHarness();
    h.adapter.listUserGroups = vi.fn(async () => {
      throw new Error('db offline');
    });
    const rctx = makeRctx({ api: h.api, config: h.ctx.config });
    const route = h.plugin.routes!.find((r) => r.path === '/rbac/me')!;
    const res = await route.handler!(rctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: 'RBAC_ERROR' } });
  });
});

/* ────────────────── adapter fallback via PluginContext.getPluginAdapter ────────────────── */

describe('rbac.api — adapter resolution via pluginAdapters', () => {
  it('picks up the adapter from PluginContext when none is passed inline', async () => {
    const adapter = makeAdapter();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const ctx: PluginContext = {
      config: {} as unknown as HoleauthConfig,
      events: { on: () => () => {}, off: () => {}, emit: async () => {} },
      logger,
      core: {} as unknown as PluginContext['core'],
      getPlugin: <T,>() => undefined as unknown as T,
      getPluginAdapter: <T,>() => adapter as unknown as T,
    };
    const plugin = rbac({ groups: GROUPS });
    const api = plugin.api(ctx);
    await adapter.assignGroup('u1', 'admin');
    expect(await api.can('u1', 'x.y')).toBe(true);
  });
});
