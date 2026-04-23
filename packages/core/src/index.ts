/**
 * @holeauth/core
 *
 * Edge-native auth primitives. This barrel re-exports the public surface;
 * consumers can also import subpaths (e.g. `@holeauth/core/jwt`).
 */
export * from './types/index.js';
export * from './errors/index.js';
export * as jwt from './jwt/index.js';
export * as session from './session/index.js';
export * as password from './password/index.js';
export * as otp from './otp/index.js';
export * as sso from './sso/index.js';
export * as adapters from './adapters/index.js';
export * as cookies from './cookies/index.js';
export * as events from './events/index.js';
export * as flows from './flows/index.js';
export * as plugins from './plugins/index.js';
export { definePlugin } from './plugins/define.js';
export type {
  HoleauthPlugin,
  PluginContext,
  PluginCoreSurface,
  PluginEvents,
  PluginLogger,
  PluginRoute,
  PluginRouteContext,
  HoleauthHooks,
  ChallengeResult,
  PluginsApi,
} from './plugins/types.js';
export { defineHoleauth, INTERNAL_REGISTRY_KEY, getRegistry } from './define.js';
