/**
 * @holeauth/rbac-yaml
 *
 * Node-only helper that loads, validates, and watches YAML-based RBAC
 * group definitions. The core `@holeauth/plugin-rbac` package itself is
 * **headless**: it accepts `groups` directly (or a reload-callback
 * function). This package bridges filesystem-based configuration into
 * that shape.
 *
 * Typical usage:
 *
 * ```ts
 * import { loadRbacYaml } from '@holeauth/rbac-yaml';
 * import { rbac } from '@holeauth/plugin-rbac';
 *
 * const yaml = loadRbacYaml('./holeauth.rbac.yml', {
 *   watch: process.env.NODE_ENV !== 'production',
 * });
 *
 * const plugin = rbac({
 *   groups: yaml.snapshot.groups,
 *   adapter: rbacAdapter,
 * });
 *
 * yaml.onReload((snapshot) => plugin.reload(snapshot.groups));
 * ```
 */

import { readFileSync, watch as fsWatch, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { rbac as rbacPlugin } from '@holeauth/plugin-rbac';
import type { RbacOptions, RbacPlugin } from '@holeauth/plugin-rbac';

/* ───────────────────────── Schema ───────────────────────── */

const PermissionNodeSchema = z
  .string()
  .min(1)
  .regex(/^!?[A-Za-z0-9_\-]+(\.([A-Za-z0-9_\-]+|\*))*\*?$|^\*$/, {
    message:
      'permission must be * or a dot-separated path (optionally prefixed ! for negation, * as trailing wildcard)',
  });

export const GroupSchema = z.object({
  default: z.boolean().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().optional(),
  inherits: z.array(z.string()).optional(),
  permissions: z.array(PermissionNodeSchema).default([]),
});

export const RbacFileSchema = z.object({
  groups: z.record(z.string(), GroupSchema),
});

export type GroupDef = z.infer<typeof GroupSchema>;
export type RbacFile = z.infer<typeof RbacFileSchema>;

/* ───────────────────── Snapshot types ───────────────────── */

export interface ResolvedGroup extends Omit<GroupDef, 'inherits'> {
  id: string;
  effective: string[];
}

export interface RbacConfigSnapshot {
  raw: RbacFile;
  /** Ordered list of resolved groups (YAML insertion order). */
  groups: ResolvedGroup[];
  /** Id of the default group (exactly one). */
  defaultGroupId: string;
}

export interface LoadOptions {
  /** Behaviour when multiple default groups exist. Default: 'warn'. */
  multipleDefaults?: 'warn' | 'throw';
  logger?: { warn: (msg: string) => void };
}

/* ───────────────────── Inheritance resolve ───────────────────── */

export function resolveInheritance(raw: RbacFile): Map<string, string[]> {
  const out = new Map<string, string[]>();

  function visit(id: string, stack: Set<string>): string[] {
    const cached = out.get(id);
    if (cached) return cached;
    if (stack.has(id)) {
      throw new Error(`rbac: inheritance cycle at group "${id}" (chain: ${[...stack, id].join(' -> ')})`);
    }
    const g = raw.groups[id];
    if (!g) throw new Error(`rbac: group "${id}" not found`);
    stack.add(id);
    const merged: string[] = [];
    for (const parent of g.inherits ?? []) {
      if (!raw.groups[parent]) {
        throw new Error(`rbac: group "${id}" inherits unknown group "${parent}"`);
      }
      merged.push(...visit(parent, stack));
    }
    stack.delete(id);
    merged.push(...g.permissions);
    out.set(id, merged);
    return merged;
  }

  for (const id of Object.keys(raw.groups)) visit(id, new Set());
  return out;
}

/* ───────────────────── Build snapshot ───────────────────── */

export function buildSnapshot(raw: RbacFile, opts: LoadOptions = {}): RbacConfigSnapshot {
  const logger = opts.logger ?? { warn: (m: string) => console.warn(`[rbac-yaml] ${m}`) };
  const order = Object.keys(raw.groups);
  const effectiveMap = resolveInheritance(raw);

  const groups: ResolvedGroup[] = [];
  for (const id of order) {
    const g = raw.groups[id];
    if (!g) continue;
    groups.push({
      id,
      default: g.default,
      displayName: g.displayName,
      description: g.description,
      priority: g.priority,
      permissions: g.permissions,
      effective: effectiveMap.get(id) ?? [],
    });
  }

  const defaults = order.filter((id) => raw.groups[id]?.default === true);
  if (defaults.length === 0) {
    throw new Error('rbac: no group has `default: true`. Exactly one default group is required.');
  }
  let defaultGroupId: string;
  if (defaults.length === 1) {
    defaultGroupId = defaults[0]!;
  } else {
    const picked = defaults[0]!;
    const msg = `multiple default groups (${defaults.join(', ')}); picking "${picked}" (first in YAML)`;
    if (opts.multipleDefaults === 'throw') throw new Error(`rbac: ${msg}`);
    logger.warn(msg);
    defaultGroupId = picked;
  }

  return { raw, groups, defaultGroupId };
}

/** Parse + validate in-memory object (no filesystem). */
export function validateRbacDefinition(obj: unknown, opts: LoadOptions = {}): RbacConfigSnapshot {
  const parsed = RbacFileSchema.parse(obj);
  return buildSnapshot(parsed, opts);
}

/**
 * Parse and validate a raw YAML string without touching the filesystem.
 *
 * **Edge-compatible** — no `node:fs` or `node:path` dependencies. Use this in
 * environments where `loadRbacYaml` cannot run (Cloudflare Workers, Deno Deploy,
 * Next.js Edge Runtime, Hono on serverless runtimes). Obtain the YAML content
 * from a KV store, an environment variable, a bundled asset, or any other
 * source your runtime supports.
 *
 * @example Cloudflare Worker / Hono Edge
 * ```ts
 * import { loadRbacYamlFromString, rbacFromSnapshot } from '@holeauth/rbac-yaml';
 *
 * // YAML content bundled at build time (e.g. via import assertion or env var)
 * const snapshot = loadRbacYamlFromString(RBAC_YAML_CONTENT);
 * const plugin = rbacFromSnapshot(snapshot, { adapter: rbacAdapter });
 * ```
 *
 * @example Pair with rbacFromYamlString for hot-reload-less dynamic config
 * ```ts
 * const content = await kv.get('rbac-config');
 * const snapshot = loadRbacYamlFromString(content);
 * ```
 */
export function loadRbacYamlFromString(content: string, opts: LoadOptions = {}): RbacConfigSnapshot {
  const parsed = parseYaml(content);
  return validateRbacDefinition(parsed, opts);
}

/* ───────────────────── File loader + watcher ───────────────────── */

export interface LoadYamlOptions extends LoadOptions {
  /** Watch the file and re-build on change. Default: false. */
  watch?: boolean;
}

export interface LoadedRbacYaml {
  /** Current snapshot (updated in-place on reload). */
  snapshot: RbacConfigSnapshot;
  /** Subscribe to reload events. Returns unsubscribe. */
  onReload(handler: (snapshot: RbacConfigSnapshot) => void): () => void;
  /** Force re-read of the file now. Returns the new snapshot. */
  reload(): RbacConfigSnapshot;
  /** Stop the watcher and free listeners. */
  stop(): void;
}

function loadFile(path: string, opts: LoadOptions): RbacConfigSnapshot {
  const text = readFileSync(path, 'utf8');
  const parsed = parseYaml(text);
  return validateRbacDefinition(parsed, opts);
}

export function loadRbacYaml(path: string, opts: LoadYamlOptions = {}): LoadedRbacYaml {
  const abs = resolve(path);
  let snapshot = loadFile(abs, opts);
  const handlers = new Set<(s: RbacConfigSnapshot) => void>();
  let watcher: FSWatcher | null = null;

  function reload(): RbacConfigSnapshot {
    const next = loadFile(abs, opts);
    snapshot = next;
    for (const h of handlers) {
      try {
        h(next);
      } catch (e) {
        opts.logger?.warn(`rbac-yaml: onReload handler threw: ${String(e)}`);
      }
    }
    return next;
  }

  if (opts.watch) {
    try {
      watcher = fsWatch(abs, { persistent: false }, () => {
        try {
          reload();
        } catch (e) {
          opts.logger?.warn(`rbac-yaml: reload failed: ${String(e)}`);
        }
      });
    } catch (e) {
      opts.logger?.warn(`rbac-yaml: could not watch ${abs}: ${String(e)}`);
    }
  }

  return {
    get snapshot() {
      return snapshot;
    },
    onReload(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    reload,
    stop() {
      watcher?.close();
      watcher = null;
      handlers.clear();
    },
  } as LoadedRbacYaml;
}

/* ──────────────────── Convenience: rbacFromYaml ──────────────────── */

export type RbacFromYamlOptions = Omit<RbacOptions, 'groups'> & LoadYamlOptions;

/**
 * One-call replacement for the three-step `loadRbacYaml` / `rbac({groups})` / `onReload` pattern.
 *
 * Before:
 * ```ts
 * const yaml = loadRbacYaml('./holeauth.rbac.yml', { watch: isDev });
 * const plugin = rbac({ groups: yaml.snapshot.groups, adapter: rbacAdapter });
 * yaml.onReload((snap) => auth.rbac.reload(snap.groups)); // ← must run AFTER auth is created
 * ```
 *
 * After:
 * ```ts
 * const rbacFromYamlPlugin = rbacFromYaml('./holeauth.rbac.yml', {
 *   adapter: rbacAdapter,
 *   watch: isDev,
 * });
 * // Pass directly to createAuthHandler({ plugins: [rbacFromYamlPlugin] })
 * // Reload is wired automatically via the plugin's onInit hook.
 * ```
 */
export function rbacFromYaml(yamlPath: string, opts: RbacFromYamlOptions = {} as RbacFromYamlOptions): RbacPlugin {
  const { watch, multipleDefaults, logger: loadLogger, ...rbacOpts } = opts;
  const yaml = loadRbacYaml(yamlPath, { watch, multipleDefaults, logger: loadLogger });

  const plugin = rbacPlugin({
    ...rbacOpts,
    groups: yaml.snapshot.groups,
  });

  // Wire hot-reload: whenever the YAML file changes, push the new group
  // definitions into the running plugin. Must happen AFTER the plugin is
  // initialised but that's fine — the listener fires on subsequent file
  // changes, never before the plugin processes its first request.
  yaml.onReload((snap) => {
    plugin.reload(snap.groups);
  });

  return plugin;
}

/* ──────────────────── rbacFromSnapshot (codegen entrypoint) ──────────────────── */

export type RbacFromSnapshotOptions = Omit<RbacOptions, 'groups'>;

/**
 * Build an RBAC plugin from a pre-resolved snapshot (typically produced by the
 * `holeauth-rbac-codegen` CLI and imported as a plain TS module). Use this in
 * environments where filesystem access is unavailable at runtime — Next.js
 * Edge, Cloudflare Workers, browser bundles, etc.
 *
 * ```ts
 * import { snapshot } from './rbac.generated';
 * import { rbacFromSnapshot } from '@holeauth/rbac-yaml';
 *
 * const plugin = rbacFromSnapshot(snapshot, { adapter: rbacAdapter });
 * ```
 *
 * The snapshot is consumed once at construction time — there is no hot-reload
 * in this mode.
 */
export function rbacFromSnapshot(
  snapshot: { groups: readonly ResolvedGroup[] },
  opts: RbacFromSnapshotOptions,
): RbacPlugin {
  return rbacPlugin({
    ...opts,
    // The plugin expects mutable arrays internally; we hand it a shallow copy.
    groups: snapshot.groups.map((g) => ({ ...g })),
  });
}
