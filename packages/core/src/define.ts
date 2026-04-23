import type {
  HoleauthConfig,
  HoleauthInstance,
  SignInResult,
  IssuedTokens,
  SessionData,
} from './types/index.js';
import type { AdapterUser } from './adapters/index.js';
import * as flows from './flows/index.js';
import * as sessionMod from './session/index.js';
import * as ssoMod from './sso/index.js';
import type { HoleauthPlugin, PluginsApi } from './plugins/types.js';
import { buildRegistry, runOnInit, type PluginRegistry } from './plugins/registry.js';
import { attachHookRunner } from './plugins/runner-ref.js';

const REGISTRY_KEY: unique symbol = Symbol.for('holeauth.registry');

/** Framework-binding helper (not part of the public API surface). */
export const INTERNAL_REGISTRY_KEY = REGISTRY_KEY;

/** Internal: retrieve the registry attached to an instance. */
export function getRegistry(instance: HoleauthInstance): PluginRegistry {
  const r = (instance as unknown as Record<symbol, PluginRegistry | undefined>)[REGISTRY_KEY];
  if (!r) throw new Error('holeauth: instance has no plugin registry attached');
  return r;
}

/**
 * defineHoleauth — primary factory.
 *
 * @example
 * ```ts
 * const auth = defineHoleauth({
 *   adapters: { … },
 *   secrets: { jwtSecret },
 *   plugins: [twofa(), rbac({ file: './holeauth.rbac.yml' })] as const,
 * });
 * auth.twofa.setup(userId); // inferred
 * auth.rbac.can(userId, 'users.edit'); // inferred
 * ```
 */
export function defineHoleauth<
  const Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
>(
  config: HoleauthConfig & { plugins?: Plugins },
): HoleauthInstance & PluginsApi<Plugins> {
  const registry = buildRegistry(config, config.plugins ?? []);
  attachHookRunner(config, registry.hooks);

  const instance: HoleauthInstance = {
    config,
    register(input): Promise<AdapterUser> {
      return flows.register(config, registry.hooks, input);
    },
    signIn(input): Promise<SignInResult> {
      return flows.signIn(config, registry.hooks, input);
    },
    signOut(input): Promise<void> {
      return flows.signOut(config, registry.hooks, input);
    },
    refresh(input): Promise<IssuedTokens> {
      return flows.refresh(config, registry.hooks, input);
    },
    async getSession(accessToken?: string): Promise<SessionData | null> {
      if (!accessToken) return null;
      return sessionMod.validateSession(config, accessToken);
    },
    changePassword(input) {
      return flows.changePassword(config, registry.hooks, input);
    },
    requestPasswordReset(input) {
      return flows.requestPasswordReset(config, registry.hooks, input);
    },
    consumePasswordReset(input) {
      return flows.consumePasswordReset(config, registry.hooks, input);
    },
    updateUser(userId, patch) {
      return flows.updateUser(config, registry.hooks, userId, patch);
    },
    deleteUser(userId) {
      return flows.deleteUser(config, registry.hooks, userId);
    },
    createInvite(input) {
      return flows.createInvite(config, registry.hooks, input);
    },
    getInviteInfo(input) {
      return flows.getInviteInfo(config, input);
    },
    consumeInvite(input) {
      return flows.consumeInvite(config, registry.hooks, input);
    },
    revokeInvite(input) {
      return flows.revokeInvite(config, input);
    },
    listInvites() {
      return flows.listInvites(config);
    },
    sso: {
      authorize: (providerId) => ssoMod.authorize(config, providerId),
      callback: (providerId, input) => ssoMod.callback(config, providerId, input),
    },
  };

  // Merge plugin api surfaces at their ids.
  const merged = { ...instance, ...registry.api } as HoleauthInstance & PluginsApi<Plugins>;
  Object.defineProperty(merged, REGISTRY_KEY, {
    value: registry,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  // Fire onInit hooks without blocking the factory — plugin authors are
  // expected to tolerate calls made before onInit resolves. Errors are
  // logged via the registry's logger surface.
  void runOnInit(registry).catch((err) => {
    registry.ctx.logger.error('plugin.onInit failed', err);
  });

  return merged;
}
