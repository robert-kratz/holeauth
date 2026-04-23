import type { HoleauthConfig, IssuedTokens, SignInResult } from '../types/index.js';
import type { AdapterUser } from '../adapters/index.js';
import type { HoleauthEvent } from '../events/types.js';
import type {
  HoleauthPlugin,
  PluginContext,
  PluginEvents,
  PluginLogger,
  PluginRoute,
  HoleauthHooks,
  ChallengeResult,
} from './types.js';
import { emit, subscribe, unsubscribe } from '../events/emitter.js';
import { issueSession } from '../session/issue.js';
import { revokeSession as coreRevokeSession } from '../session/revoke.js';

/**
 * Canonical list of paths handled directly by core in @holeauth/nextjs'
 * dispatcher. Exported so framework bindings and plugin route validation
 * share a single source of truth.
 */
export const CORE_ROUTE_PATHS: ReadonlySet<string> = new Set<string>([
  'GET /session',
  'GET /csrf',
  'GET /authorize/:provider',
  'GET /callback/:provider',
  'POST /register',
  'POST /signin',
  'POST /signout',
  'POST /refresh',
  'POST /password/change',
  'POST /password/reset/request',
  'POST /password/reset/consume',
  'GET /invite/info',
  'GET /invite/list',
  'POST /invite/create',
  'POST /invite/consume',
  'POST /invite/revoke',
]);

export interface PluginRegistry {
  /** All registered plugins, topo-sorted by dependsOn. */
  readonly plugins: readonly HoleauthPlugin[];
  /** Map of plugin id → ReturnType<plugin.api>. */
  readonly api: Record<string, unknown>;
  /** All collected routes (in plugin load order). */
  readonly routes: readonly PluginRoute[];
  /** Hook runner helpers, closed over the sorted plugin list. */
  readonly hooks: HookRunner;
  readonly ctx: PluginContext;
}

export interface HookRunner {
  runRegisterBefore(input: { email: string; password: string; name?: string | null }): Promise<void>;
  runRegisterAfter(user: AdapterUser): Promise<void>;
  runSignInBefore(input: { email: string; ip?: string; userAgent?: string }): Promise<void>;
  runSignInChallenge(
    user: AdapterUser,
    input: { ip?: string; userAgent?: string },
  ): Promise<ChallengeResult | null>;
  runSignInAfter(data: {
    user: AdapterUser;
    tokens: IssuedTokens;
    method: string;
  }): Promise<void>;
  runSignOutAfter(data: { userId: string | null; sessionId: string | null }): Promise<void>;
  runRefreshBefore(input: { ip?: string; userAgent?: string }): Promise<void>;
  runRefreshAfter(data: { userId: string; sessionId: string; tokens: IssuedTokens }): Promise<void>;
  runPasswordChangeBefore(input: { userId: string; currentPassword: string; newPassword: string }): Promise<void>;
  runPasswordChangeAfter(data: { userId: string }): Promise<void>;
  runPasswordResetBefore(input: { email: string; token?: string; newPassword?: string }): Promise<void>;
  runPasswordResetAfter(data: { userId: string; stage: 'request' | 'consume' }): Promise<void>;
  runUserUpdateAfter(data: { user: AdapterUser; patch: Partial<AdapterUser> }): Promise<void>;
  runUserDeleteAfter(data: { userId: string }): Promise<void>;
  runSessionIssue(data: { userId: string; sessionId: string; familyId: string }): Promise<void>;
  runSessionRotate(data: { userId: string; sessionId: string; familyId: string }): Promise<void>;
  runSessionRevoke(data: { userId: string | null; sessionId: string | null; scope?: 'all' }): Promise<void>;
}

function defaultLogger(cfg: HoleauthConfig): PluginLogger {
  const prefix = '[holeauth]';
  const silent = cfg.logger?.silent === true;
  return {
    debug: silent ? () => {} : (m, d) => console.debug(prefix, m, d ?? ''),
    info: silent ? () => {} : (m, d) => console.info(prefix, m, d ?? ''),
    warn: (m, d) => console.warn(prefix, m, d ?? ''),
    error: (m, e) => console.error(prefix, m, e ?? ''),
  };
}

/** Kahn's algorithm — throws on cycles / missing deps. */
function topoSort(plugins: readonly HoleauthPlugin[]): HoleauthPlugin[] {
  const byId = new Map<string, HoleauthPlugin>();
  for (const p of plugins) {
    if (byId.has(p.id)) throw new Error(`holeauth: duplicate plugin id "${p.id}"`);
    byId.set(p.id, p);
  }
  const inDeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const p of plugins) {
    inDeg.set(p.id, 0);
    dependents.set(p.id, []);
  }
  for (const p of plugins) {
    for (const dep of p.dependsOn ?? []) {
      if (!byId.has(dep)) {
        throw new Error(`holeauth: plugin "${p.id}" depends on missing plugin "${dep}"`);
      }
      inDeg.set(p.id, (inDeg.get(p.id) ?? 0) + 1);
      dependents.get(dep)!.push(p.id);
    }
  }
  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  const sorted: HoleauthPlugin[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(byId.get(id)!);
    for (const dep of dependents.get(id) ?? []) {
      const next = (inDeg.get(dep) ?? 0) - 1;
      inDeg.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }
  if (sorted.length !== plugins.length) {
    throw new Error('holeauth: plugin dependsOn graph has a cycle');
  }
  return sorted;
}

function buildPluginEvents(cfg: HoleauthConfig): PluginEvents {
  return {
    on(type, handler) {
      return subscribe(cfg, type, handler);
    },
    off(type, handler) {
      unsubscribe(cfg, type, handler);
    },
    async emit(e) {
      await emit(cfg, e);
    },
  };
}

function routeKey(r: PluginRoute): string {
  return `${r.method} ${r.path}`;
}

function validatePluginRoutes(plugins: readonly HoleauthPlugin[]): PluginRoute[] {
  const seen = new Map<string, string>();
  const out: PluginRoute[] = [];
  for (const p of plugins) {
    for (const r of p.routes ?? []) {
      if (!r.path.startsWith('/')) {
        throw new Error(
          `holeauth: plugin "${p.id}" declared route with invalid path "${r.path}" (must start with '/')`,
        );
      }
      const key = routeKey(r);
      if (CORE_ROUTE_PATHS.has(key)) {
        throw new Error(
          `holeauth: plugin "${p.id}" route ${key} conflicts with a core route`,
        );
      }
      const prev = seen.get(key);
      if (prev) {
        throw new Error(
          `holeauth: plugin "${p.id}" route ${key} conflicts with plugin "${prev}"`,
        );
      }
      seen.set(key, p.id);
      out.push(r);
    }
  }
  return out;
}

/* ─────────────────────── Hook runner factory ─────────────────────── */

function makeHookRunner(
  plugins: readonly HoleauthPlugin[],
  ctx: PluginContext,
): HookRunner {
  const logger = ctx.logger;

  async function runAfter<T>(
    label: string,
    fns: Array<(data: unknown, ctx: PluginContext) => Promise<void> | void>,
    data: T,
  ): Promise<void> {
    for (const fn of fns) {
      try {
        await fn(data, ctx);
      } catch (err) {
        logger.error(`hook ${label} threw`, err);
        // Fire-and-forget event so observers can surface it.
        void ctx.events
          .emit({
            type: 'plugin.error',
            data: { hook: label, error: String((err as Error)?.message ?? err) },
          })
          .catch(() => {});
      }
    }
  }

  async function runBefore<T>(
    fns: Array<(input: unknown, ctx: PluginContext) => Promise<void> | void>,
    input: T,
  ): Promise<void> {
    // `before` hooks may throw to abort — propagate.
    for (const fn of fns) await fn(input, ctx);
  }

  // Collect per-hook function lists up-front for fast dispatch.
  const pick = <K extends keyof HoleauthHooks, S extends string>(
    group: K,
    slot: S,
  ): Array<(arg: unknown, ctx: PluginContext) => Promise<void> | void> =>
    plugins
      .map((p) => {
        const g = p.hooks?.[group] as Record<string, unknown> | undefined;
        return g?.[slot] as ((arg: unknown, ctx: PluginContext) => Promise<void> | void) | undefined;
      })
      .filter((x): x is (arg: unknown, ctx: PluginContext) => Promise<void> | void => !!x);

  const regBefore = pick('register', 'before');
  const regAfter = pick('register', 'after');
  const siBefore = pick('signIn', 'before');
  const siChallenge = plugins
    .map((p) => ({ id: p.id, fn: p.hooks?.signIn?.challenge }))
    .filter((x): x is { id: string; fn: NonNullable<NonNullable<HoleauthHooks['signIn']>['challenge']> } => !!x.fn);
  const siAfter = pick('signIn', 'after');
  const soAfter = pick('signOut', 'after');
  const rfBefore = pick('refresh', 'before');
  const rfAfter = pick('refresh', 'after');
  const pcBefore = pick('passwordChange', 'before');
  const pcAfter = pick('passwordChange', 'after');
  const prBefore = pick('passwordReset', 'before');
  const prAfter = pick('passwordReset', 'after');
  const uuAfter = pick('userUpdate', 'after');
  const udAfter = pick('userDelete', 'after');
  const seIssue = pick('session', 'onIssue');
  const seRotate = pick('session', 'onRotate');
  const seRevoke = pick('session', 'onRevoke');

  return {
    runRegisterBefore: (i) => runBefore(regBefore, i),
    runRegisterAfter: (u) => runAfter('register.after', regAfter, u),
    runSignInBefore: (i) => runBefore(siBefore, i),
    async runSignInChallenge(user, input) {
      let winner: ChallengeResult | null = null;
      for (const { id, fn } of siChallenge) {
        let result: ChallengeResult | null;
        try {
          result = (await fn(user, input, ctx)) ?? null;
        } catch (err) {
          logger.error(`signIn.challenge[${id}] threw`, err);
          continue;
        }
        if (!result) continue;
        if (result.pluginId !== id) {
          logger.warn(
            `signIn.challenge[${id}] returned pluginId="${result.pluginId}"; forcing "${id}"`,
          );
          result.pluginId = id;
        }
        if (winner) {
          logger.warn(
            `multiple signIn.challenge winners — using first ("${winner.pluginId}"), ignoring "${result.pluginId}"`,
          );
          continue;
        }
        winner = result;
      }
      return winner;
    },
    runSignInAfter: (d) => runAfter('signIn.after', siAfter, d),
    runSignOutAfter: (d) => runAfter('signOut.after', soAfter, d),
    runRefreshBefore: (i) => runBefore(rfBefore, i),
    runRefreshAfter: (d) => runAfter('refresh.after', rfAfter, d),
    runPasswordChangeBefore: (i) => runBefore(pcBefore, i),
    runPasswordChangeAfter: (d) => runAfter('passwordChange.after', pcAfter, d),
    runPasswordResetBefore: (i) => runBefore(prBefore, i),
    runPasswordResetAfter: (d) => runAfter('passwordReset.after', prAfter, d),
    runUserUpdateAfter: (d) => runAfter('userUpdate.after', uuAfter, d),
    runUserDeleteAfter: (d) => runAfter('userDelete.after', udAfter, d),
    runSessionIssue: (d) => runAfter('session.onIssue', seIssue, d),
    runSessionRotate: (d) => runAfter('session.onRotate', seRotate, d),
    runSessionRevoke: (d) => runAfter('session.onRevoke', seRevoke, d),
  };
}

/* ──────────────────────── Core surface factory ──────────────────────── */

function makeCoreSurface(
  cfg: HoleauthConfig,
  getHooks: () => HookRunner,
): PluginContext['core'] {
  return {
    getUserById: (id) => cfg.adapters.user.getUserById(id),
    getUserByEmail: (email) => cfg.adapters.user.getUserByEmail(email),
    async issueSession(input) {
      return issueSession(cfg, {
        userId: input.userId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    },
    async revokeSession(sessionId, userId) {
      return coreRevokeSession(cfg, sessionId, userId);
    },
    async completeSignIn(userId, input) {
      const user = await cfg.adapters.user.getUserById(userId);
      if (!user) throw new Error('completeSignIn: user not found');
      const tokens = await issueSession(cfg, {
        userId: user.id,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      await emit(cfg, {
        type: 'user.signed_in',
        userId: user.id,
        sessionId: tokens.sessionId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        data: { method: input.method },
      });
      await getHooks().runSignInAfter({ user, tokens, method: input.method });
      return { user, tokens };
    },
    async issueSignInResult(user, input): Promise<SignInResult> {
      const tokens = await issueSession(cfg, {
        userId: user.id,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      return { kind: 'ok', user, tokens };
    },
  };
}

/* ─────────────────────────── Build registry ─────────────────────────── */

/**
 * Build a PluginRegistry from the given plugin list. Throws on:
 *   - duplicate ids
 *   - missing `dependsOn` targets
 *   - dependency cycles
 *   - route collisions with core or other plugins
 */
export function buildRegistry(
  cfg: HoleauthConfig,
  rawPlugins: readonly HoleauthPlugin[] = [],
): PluginRegistry {
  const plugins = topoSort(rawPlugins);
  const routes = validatePluginRoutes(plugins);

  const apiMap: Record<string, unknown> = {};
  // Build a late-binding context so plugins can call getPlugin() on each
  // other once all apis are wired. We seed `hooks` with a lazy getter too
  // so the core surface can invoke hooks from within completeSignIn.
  let hookRunner!: HookRunner;

  const ctx: PluginContext = {
    config: cfg,
    events: buildPluginEvents(cfg),
    logger: defaultLogger(cfg),
    core: makeCoreSurface(cfg, () => hookRunner),
    getPlugin<T = unknown>(id: string): T {
      const v = apiMap[id];
      if (v === undefined) throw new Error(`holeauth: plugin "${id}" not registered`);
      return v as T;
    },
    getPluginAdapter<T = unknown>(id: string): T | undefined {
      return cfg.pluginAdapters?.[id] as T | undefined;
    },
  };

  // Wire each plugin's api (hooks run later via runner). Ordered by topo sort.
  for (const p of plugins) {
    apiMap[p.id] = p.api(ctx);
  }
  hookRunner = makeHookRunner(plugins, ctx);

  return {
    plugins,
    api: apiMap,
    routes,
    hooks: hookRunner,
    ctx,
  };
}

/** No-op registry for when no plugins are supplied. */
export function emptyRegistry(cfg: HoleauthConfig): PluginRegistry {
  return buildRegistry(cfg, []);
}

export async function runOnInit(registry: PluginRegistry): Promise<void> {
  for (const p of registry.plugins) {
    if (p.onInit) await p.onInit(registry.ctx);
  }
}

export type { HoleauthEvent };
