/**
 * @holeauth/plugin-rbac — headless RBAC plugin.
 *
 * No filesystem access, no YAML parsing. Groups are supplied either as
 * an array (static) or via the `reload()` API (for dynamic sources like
 * `@holeauth/rbac-yaml` or DB-backed groups from `@holeauth/rbac-drizzle`).
 */

import {
  definePlugin,
  type PluginContext,
  type HoleauthPlugin,
  type PluginRoute,
} from '@holeauth/core';
import { HoleauthError } from '@holeauth/core/errors';

import type { RbacAdapter, UserGroupAssignment } from './adapter.js';
import { can, canAll, canAny, isNegation, matchPattern, normaliseNode } from './matcher.js';
import { defaultRbacCache, type RbacCacheAdapter } from './cache.js';

export type { RbacAdapter, UserGroupAssignment, UserPermissionAssignment } from './adapter.js';
export type { RbacCacheAdapter } from './cache.js';
export { defaultRbacCache } from './cache.js';
export {
  can as matchNodes,
  canAll as matchNodesAll,
  canAny as matchNodesAny,
  matchPattern,
} from './matcher.js';

const PLUGIN_ID = 'rbac' as const;

/**
 * A group definition. Matches the resolved shape produced by
 * `@holeauth/rbac-yaml`'s `ResolvedGroup`, but the plugin doesn't
 * depend on that package.
 */
export interface GroupDefinition {
  id: string;
  /** Exactly one group must have `default: true`. */
  default?: boolean;
  displayName?: string;
  description?: string;
  priority?: number;
  /** Full effective permission list (inheritance already resolved by caller). */
  effective: string[];
  /** Raw own permissions (optional; informational). */
  permissions?: string[];
}

export interface RbacOptions {
  /**
   * Initial group definitions. Must contain exactly one with `default:true`.
   * Pass the output of `@holeauth/rbac-yaml`'s `snapshot.groups`, or an
   * array of your own objects, or leave undefined and call `reload()` later.
   */
  groups: GroupDefinition[];
  /** Adapter for per-user group / permission assignments. */
  adapter?: RbacAdapter;
  /** Per-user permission cache TTL (ms). Default: 5_000 (dev) / 30_000 (prod). */
  cacheTtlMs?: number;
  /** Custom cache adapter. Defaults to in-memory TTL. */
  cache?: RbacCacheAdapter;
}

export interface RbacApi {
  can(userId: string, node: string): Promise<boolean>;
  canAll(userId: string, nodes: string[]): Promise<boolean>;
  canAny(userId: string, nodes: string[]): Promise<boolean>;

  listGroups(): GroupDefinition[];
  getGroup(id: string): GroupDefinition | null;
  getUserGroups(userId: string): Promise<GroupDefinition[]>;
  getUserPermissions(userId: string): Promise<string[]>;
  getEffectiveNodes(userId: string): Promise<string[]>;

  assignGroup(userId: string, groupId: string): Promise<void>;
  removeGroup(userId: string, groupId: string): Promise<void>;
  grant(userId: string, node: string): Promise<void>;
  revoke(userId: string, node: string): Promise<void>;

  /** Swap in a new group set at runtime (e.g. from YAML reload). */
  reload(groups: GroupDefinition[]): void;
  /** Assignments referring to a group id that no longer exists. */
  listOrphans(): Promise<UserGroupAssignment[]>;
  /** Current groups (read-only). */
  snapshot(): { groups: GroupDefinition[]; defaultGroupId: string };
}

export interface RbacPlugin extends HoleauthPlugin<typeof PLUGIN_ID, RbacApi> {}

function buildGroupIndex(groups: GroupDefinition[]): {
  byId: Map<string, GroupDefinition>;
  order: string[];
  defaultGroupId: string;
} {
  const byId = new Map<string, GroupDefinition>();
  const order: string[] = [];
  for (const g of groups) {
    if (byId.has(g.id)) throw new Error(`rbac: duplicate group id "${g.id}"`);
    byId.set(g.id, g);
    order.push(g.id);
  }
  const defaults = order.filter((id) => byId.get(id)?.default === true);
  if (defaults.length === 0) {
    throw new Error('rbac: no group has `default: true`.');
  }
  if (defaults.length > 1) {
    throw new Error(`rbac: multiple default groups (${defaults.join(', ')}); only one allowed.`);
  }
  return { byId, order, defaultGroupId: defaults[0]! };
}

/**
 * Build the set of all positive permission patterns known to the RBAC
 * configuration. Used to validate direct per-user grants/revokes.
 */
function collectKnownPatterns(groups: GroupDefinition[]): string[] {
  const out = new Set<string>();
  for (const g of groups) {
    for (const n of g.effective) if (!isNegation(n)) out.add(n);
    if (g.permissions) {
      for (const n of g.permissions) if (!isNegation(n)) out.add(n);
    }
  }
  return [...out];
}

/**
 * Is `node` (optionally negated) a known permission, i.e. does it overlap
 * with any pattern defined by the loaded group set? Supports wildcard
 * queries: `posts.*` is accepted if any known pattern is covered by it.
 */
function isKnownPermission(node: string, knownPatterns: string[]): boolean {
  const bare = normaliseNode(node.trim());
  if (!bare) return false;
  if (bare === '*') return knownPatterns.length > 0;
  const hasWildcard = bare.endsWith('*');
  for (const p of knownPatterns) {
    if (p === bare) return true;
    // A known pattern (possibly wildcard) covers the query.
    if (matchPattern(p, bare)) return true;
    // The query itself is a wildcard that covers a known pattern.
    if (hasWildcard && matchPattern(bare, normaliseNode(p))) return true;
  }
  return false;
}

function requireAdapter(adapter: RbacAdapter | undefined): RbacAdapter {
  if (!adapter) {
    throw new HoleauthError(
      'RBAC_NO_ADAPTER',
      'rbac adapter not configured. Pass `adapter` to rbac() or set pluginAdapters.rbac.',
      500,
    );
  }
  return adapter;
}

export function rbac(options: RbacOptions): RbacPlugin {
  const initialGroups = options.groups;
  const optAdapter = options.adapter;
  const cacheTtl = options.cacheTtlMs
    ?? ((globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'production'
      ? 30_000
      : 5_000);
  const cache = options.cache ?? defaultRbacCache(cacheTtl);

  let index = buildGroupIndex(initialGroups);
  let logger: PluginContext['logger'] | null = null;
  let resolvedAdapter: RbacAdapter | undefined = optAdapter;

  async function computeEffective(userId: string): Promise<string[]> {
    const cached = await cache.get(userId);
    if (cached) return cached;
    const adapter = requireAdapter(resolvedAdapter);
    const assignedGroups = await adapter.listUserGroups(userId);
    const groupIds = new Set<string>([index.defaultGroupId, ...assignedGroups]);
    const groups: GroupDefinition[] = [];
    for (const id of groupIds) {
      const g = index.byId.get(id);
      if (g) groups.push(g);
      else logger?.warn(`rbac: user "${userId}" has orphan group "${id}"`);
    }
    groups.sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pa - pb;
      return index.order.indexOf(a.id) - index.order.indexOf(b.id);
    });
    const effective: string[] = [];
    for (const g of groups) effective.push(...g.effective);
    const direct = await adapter.listUserPermissions(userId);
    effective.push(...direct);
    await cache.set(userId, effective);
    return effective;
  }

  /* ────────── Route: GET /rbac/me ────────── */
  const meRoute: PluginRoute = {
    method: 'GET',
    path: '/rbac/me',
    requireAuth: true,
    async handler(ctx) {
      const session = await ctx.getSession();
      if (!session) {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      try {
        const adapter = requireAdapter(resolvedAdapter);
        const groups = await adapter.listUserGroups(session.userId);
        const effective = await computeEffective(session.userId);
        const allGroups = new Set<string>([index.defaultGroupId, ...groups]);
        return new Response(
          JSON.stringify({ groups: [...allGroups], permissions: effective }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: { code: 'RBAC_ERROR', message: String((e as Error).message) } }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        );
      }
    },
  };

  return definePlugin({
    id: PLUGIN_ID,
    version: '0.0.0',
    adapter: optAdapter,
    routes: [meRoute],

    hooks: {
      register: {
        async after(user) {
          try {
            const adapter = requireAdapter(resolvedAdapter);
            await adapter.assignGroup(user.id, index.defaultGroupId);
          } catch (e) {
            logger?.error('rbac: failed to assign default group', e);
          }
        },
      },
      userDelete: {
        async after({ userId }) {
          await cache.invalidate(userId);
          try {
            const adapter = requireAdapter(resolvedAdapter);
            await adapter.purgeUser(userId);
          } catch (e) {
            logger?.error('rbac: purgeUser failed', e);
          }
        },
      },
    },

    api(ctx: PluginContext): RbacApi {
      logger = ctx.logger;
      // Prefer adapter from pluginAdapters config if not passed inline.
      if (!resolvedAdapter) {
        resolvedAdapter = ctx.getPluginAdapter<RbacAdapter>(PLUGIN_ID);
      }

      return {
        async can(userId, node) {
          return can(await computeEffective(userId), node);
        },
        async canAll(userId, nodes) {
          return canAll(await computeEffective(userId), nodes);
        },
        async canAny(userId, nodes) {
          return canAny(await computeEffective(userId), nodes);
        },
        listGroups() {
          return index.order.map((id) => index.byId.get(id)!);
        },
        getGroup(id) {
          return index.byId.get(id) ?? null;
        },
        async getUserGroups(userId) {
          const adapter = requireAdapter(resolvedAdapter);
          const ids = new Set<string>([index.defaultGroupId, ...(await adapter.listUserGroups(userId))]);
          const out: GroupDefinition[] = [];
          for (const id of ids) {
            const g = index.byId.get(id);
            if (g) out.push(g);
          }
          return out;
        },
        getUserPermissions(userId) {
          return requireAdapter(resolvedAdapter).listUserPermissions(userId);
        },
        getEffectiveNodes(userId) {
          return computeEffective(userId);
        },
        async assignGroup(userId, groupId) {
          if (!index.byId.has(groupId)) {
            throw new HoleauthError('RBAC_UNKNOWN_GROUP', `unknown group "${groupId}"`, 400);
          }
          await requireAdapter(resolvedAdapter).assignGroup(userId, groupId);
          await cache.invalidate(userId);
        },
        async removeGroup(userId, groupId) {
          if (!index.byId.has(groupId)) {
            throw new HoleauthError('RBAC_UNKNOWN_GROUP', `unknown group "${groupId}"`, 400);
          }
          await requireAdapter(resolvedAdapter).removeGroup(userId, groupId);
          await cache.invalidate(userId);
        },
        async grant(userId, node) {
          const known = collectKnownPatterns(index.order.map((id) => index.byId.get(id)!));
          if (!isKnownPermission(node, known)) {
            throw new HoleauthError(
              'RBAC_UNKNOWN_PERMISSION',
              `unknown permission node "${node}"`,
              400,
            );
          }
          await requireAdapter(resolvedAdapter).grantPermission(userId, node);
          await cache.invalidate(userId);
        },
        async revoke(userId, node) {
          await requireAdapter(resolvedAdapter).revokePermission(userId, node);
          await cache.invalidate(userId);
        },
        reload(groups) {
          index = buildGroupIndex(groups);
          void cache.clear();
        },
        async listOrphans() {
          const rows = await requireAdapter(resolvedAdapter).listAllGroupAssignments();
          return rows.filter((r) => !index.byId.has(r.groupId));
        },
        snapshot() {
          return {
            groups: index.order.map((id) => index.byId.get(id)!),
            defaultGroupId: index.defaultGroupId,
          };
        },
      };
    },
  });
}
