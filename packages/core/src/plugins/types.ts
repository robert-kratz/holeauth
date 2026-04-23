/**
 * Plugin types.
 *
 * A holeauth plugin is a first-class extension that can:
 *   - contribute its own adapter (opaque to core, typed to the plugin)
 *   - hook into core flows (register / signIn / refresh / signOut /
 *     passwordChange / passwordReset / userUpdate / userDelete / session.*)
 *   - contribute HTTP routes that the framework binding (@holeauth/nextjs)
 *     mounts automatically under the same prefix as core routes
 *   - expose a typed API surface that is merged into the returned
 *     HoleauthInstance at `auth[plugin.id]`
 *
 * Plugins are registered via `defineHoleauth({ plugins: [...] as const })`.
 * The returned instance type is inferred from the tuple so consumers get
 * full IntelliSense without any `declare module` augmentation.
 */

import type { HoleauthConfig, IssuedTokens, SignInResult } from '../types/index.js';
import type { AdapterUser } from '../adapters/index.js';
import type { HoleauthEvent } from '../events/types.js';

/** Minimal logger surface. Plugins MUST NOT depend on console directly. */
export interface PluginLogger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, err?: unknown): void;
}

/**
 * Event emitter handle exposed to plugins. Intentionally narrower than the
 * internal emitter — plugins may subscribe, unsubscribe, and emit events
 * scoped to their id namespace.
 */
export interface PluginEvents {
  on(type: string, handler: (e: HoleauthEvent) => void | Promise<void>): () => void;
  off(type: string, handler: (e: HoleauthEvent) => void | Promise<void>): void;
  /** Emit a (persisted + observed) event. Plugins should namespace as `<id>.<name>`. */
  emit(e: HoleauthEvent): Promise<void>;
}

/**
 * Request context passed to plugin-owned routes. Framework bindings
 * (e.g. @holeauth/nextjs) adapt their native primitives into this shape.
 */
export interface PluginRouteContext {
  req: Request;
  /** Parsed body (best-effort JSON) — may be empty object. */
  body: Record<string, unknown>;
  /** Response headers the handler can append Set-Cookie / other headers to. */
  responseHeaders: Headers;
  /** Read raw cookies. */
  cookies: {
    get(name: string): string | undefined;
  };
  /** Set a cookie on the response (framework-serialized). */
  setCookie(spec: {
    name: string;
    value: string;
    maxAge?: number;
    httpOnly?: boolean;
    path?: string;
    sameSite?: 'lax' | 'strict' | 'none';
  }): void;
  /** Current authenticated session, if any (cheap — cached per request). */
  getSession(): Promise<{ userId: string; sessionId: string; expiresAt: number } | null>;
  /** Client metadata (ip + user-agent). */
  meta: { ip?: string; userAgent?: string };
  /** Plugin context (config + adapters + core helpers + other plugin APIs). */
  plugin: PluginContext;
}

export interface PluginRoute {
  method: 'GET' | 'POST';
  /** Path relative to the auth basePath (e.g. '/2fa/verify'). Must start with '/'. */
  path: string;
  /** If true, the dispatcher enforces a valid session before calling the handler. */
  requireAuth?: boolean;
  /** If true, the dispatcher enforces CSRF (double-submit). */
  requireCsrf?: boolean;
  /** Your handler. Return a Response; the dispatcher merges response headers. */
  handler(ctx: PluginRouteContext): Promise<Response> | Response;
}

/**
 * Result produced by a plugin's signIn challenge hook. Plugins may return
 * `null` to opt out (user not enrolled in this factor) or a pending state
 * to halt sign-in pending a follow-up verification step.
 */
export interface ChallengeResult {
  /** Plugin id (must match the returning plugin's id). */
  pluginId: string;
  /** Opaque token issued by the plugin (typically a short-lived JWT). */
  pendingToken: string;
  /** Unix-ms expiry. */
  expiresAt: number;
  /** Arbitrary extra payload echoed back to the caller. */
  data?: Record<string, unknown> | null;
}

export interface RegisterHookInput {
  email: string;
  password: string;
  name?: string | null;
}

export interface PasswordChangeHookInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface PasswordResetHookInput {
  email: string;
  token?: string;
  newPassword?: string;
}

export interface SessionIssueHookData {
  userId: string;
  sessionId: string;
  familyId: string;
}

export interface SessionRotateHookData {
  userId: string;
  sessionId: string;
  familyId: string;
}

export interface SessionRevokeHookData {
  userId: string | null;
  sessionId: string | null;
  /** Set when the revoke is a global signout for the user. */
  scope?: 'all';
}

/**
 * Hooks are co-operative, never destructive. `before` hooks may throw to
 * abort a flow; `after` hooks run post-success and must not throw —
 * exceptions are caught, logged, and emitted as `plugin.error` events.
 */
export interface HoleauthHooks {
  register?: {
    before?(input: RegisterHookInput, ctx: PluginContext): Promise<void> | void;
    after?(user: AdapterUser, ctx: PluginContext): Promise<void> | void;
  };
  signIn?: {
    before?(input: { email: string; ip?: string; userAgent?: string }, ctx: PluginContext): Promise<void> | void;
    /**
     * Return a ChallengeResult to halt signIn and require a follow-up step.
     * Return `null` to opt out. Only the first non-null wins; subsequent
     * non-null results trigger a warning.
     */
    challenge?(
      user: AdapterUser,
      input: { ip?: string; userAgent?: string },
      ctx: PluginContext,
    ): Promise<ChallengeResult | null> | ChallengeResult | null;
    after?(
      result: { user: AdapterUser; tokens: IssuedTokens; method: 'password' | 'passkey' | 'sso' | string },
      ctx: PluginContext,
    ): Promise<void> | void;
  };
  signOut?: {
    after?(data: { userId: string | null; sessionId: string | null }, ctx: PluginContext): Promise<void> | void;
  };
  refresh?: {
    before?(input: { ip?: string; userAgent?: string }, ctx: PluginContext): Promise<void> | void;
    after?(data: { userId: string; sessionId: string; tokens: IssuedTokens }, ctx: PluginContext): Promise<void> | void;
  };
  passwordChange?: {
    before?(input: PasswordChangeHookInput, ctx: PluginContext): Promise<void> | void;
    after?(data: { userId: string }, ctx: PluginContext): Promise<void> | void;
  };
  passwordReset?: {
    before?(input: PasswordResetHookInput, ctx: PluginContext): Promise<void> | void;
    after?(data: { userId: string; stage: 'request' | 'consume' }, ctx: PluginContext): Promise<void> | void;
  };
  userUpdate?: {
    after?(data: { user: AdapterUser; patch: Partial<AdapterUser> }, ctx: PluginContext): Promise<void> | void;
  };
  userDelete?: {
    after?(data: { userId: string }, ctx: PluginContext): Promise<void> | void;
  };
  session?: {
    onIssue?(data: SessionIssueHookData, ctx: PluginContext): Promise<void> | void;
    onRotate?(data: SessionRotateHookData, ctx: PluginContext): Promise<void> | void;
    onRevoke?(data: SessionRevokeHookData, ctx: PluginContext): Promise<void> | void;
  };
}

/**
 * Curated core surface exposed to plugins. Deliberately narrower than
 * HoleauthInstance to prevent plugins from ping-ponging through the
 * public API and to keep plugin code decoupled from framework bindings.
 */
export interface PluginCoreSurface {
  getUserById(id: string): Promise<AdapterUser | null>;
  getUserByEmail(email: string): Promise<AdapterUser | null>;
  issueSession(input: { userId: string; ip?: string | null; userAgent?: string | null }): Promise<IssuedTokens>;
  /**
   * Run `signIn.after` hooks for a given user + method, then issue tokens.
   * Used by passkey / SSO to funnel through the same post-sign-in hook
   * chain as password sign-in.
   */
  completeSignIn(
    userId: string,
    input: { method: string; ip?: string; userAgent?: string },
  ): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;
  revokeSession(sessionId: string, userId?: string): Promise<void>;
  /** Shortcut for read-only code paths: pre-computes the SignInResult for a user (no challenge). */
  issueSignInResult(user: AdapterUser, input: { ip?: string; userAgent?: string }): Promise<SignInResult>;
}

/**
 * Full context handed to plugins. `getPlugin` is typed via dependsOn-aware
 * overloads at the registry level.
 */
export interface PluginContext {
  config: HoleauthConfig;
  events: PluginEvents;
  logger: PluginLogger;
  core: PluginCoreSurface;
  /** Retrieve another plugin's API by id. Throws if not found. */
  getPlugin<T = unknown>(id: string): T;
  /**
   * Retrieve this plugin's adapter from `config.pluginAdapters[id]`.
   * Returns `undefined` if none was supplied. Plugins decide whether
   * that is an error (most will throw a friendly message).
   */
  getPluginAdapter<T = unknown>(id: string): T | undefined;
}

/**
 * A holeauth plugin. Users construct plugins via `definePlugin(...)`.
 *
 * Type parameters:
 *   - Id:  literal id (so `auth[plugin.id]` can be inferred)
 *   - Api: the typed public API produced by `api(ctx)`
 */
export interface HoleauthPlugin<Id extends string = string, Api = unknown> {
  readonly id: Id;
  readonly version?: string;
  /** Plugin ids that must be loaded before this plugin. */
  readonly dependsOn?: readonly string[];
  /** Plugin-owned adapter instance. Opaque to core; typed inside the plugin. */
  readonly adapter?: unknown;
  /** Hook implementations. Every key optional. */
  readonly hooks?: HoleauthHooks;
  /** HTTP routes auto-mounted by the framework binding. */
  readonly routes?: readonly PluginRoute[];
  /** Construct the public API surface. Called once per defineHoleauth(). */
  readonly api: (ctx: PluginContext) => Api;
  /** Called after all plugins have been wired. */
  readonly onInit?: (ctx: PluginContext) => Promise<void> | void;
  /** Called on shutdown (best-effort; consumer-controlled). */
  readonly onShutdown?: () => Promise<void> | void;
}

/** Helper type: derive `auth[id]` mapping from a plugins tuple. */
export type PluginsApi<Plugins extends readonly HoleauthPlugin<string, unknown>[]> = {
  [P in Plugins[number] as P['id']]: ReturnType<P['api']>;
};
