import type { RbacApi } from '@holeauth/plugin-rbac';
import { auth } from './auth';

/**
 * Typed accessor for the rbac plugin api on the playground's auth instance.
 *
 * `createAuthHandler` (next.js binding) does not carry the plugin generics
 * through, but the runtime instance is still merged with `PluginsApi<…>`
 * from `defineHoleauth`. We just re-attach the type here.
 */
export function getRbac(): RbacApi {
  return (auth as unknown as { rbac: RbacApi }).rbac;
}
