import type { HoleauthPlugin, PluginContext } from './types.js';

/**
 * Identity helper that preserves the literal `id` on the plugin type so
 * `PluginsApi<Plugins>` can index by it with full type safety.
 *
 * Usage:
 *   export const twofa = () => definePlugin({
 *     id: 'twofa' as const,
 *     api: (ctx) => ({ setup(userId) { ... } }),
 *   });
 */
export function definePlugin<const P extends HoleauthPlugin<string, unknown>>(p: P): P {
  return p;
}

export type { HoleauthPlugin, PluginContext } from './types.js';
