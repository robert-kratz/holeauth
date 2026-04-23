import type { TwoFactorApi } from '@holeauth/plugin-2fa';
import type { PasskeyApi } from '@holeauth/plugin-passkey';
import { auth } from './auth';

/**
 * Typed accessors for plugin APIs on the playground's auth instance. The
 * `createAuthHandler` wrapper does not thread plugin generics through, but
 * the runtime instance still exposes them.
 */
export function getTwofa(): TwoFactorApi {
  return (auth as unknown as { twofa: TwoFactorApi }).twofa;
}

export function getPasskey(): PasskeyApi {
  return (auth as unknown as { passkey: PasskeyApi }).passkey;
}
