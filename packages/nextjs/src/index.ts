import { cookies } from 'next/headers';
import { defineHoleauth, type HoleauthConfig, type HoleauthInstance } from '@holeauth/core';
import type { HoleauthPlugin, PluginsApi } from '@holeauth/core';
import * as sessionMod from '@holeauth/core/session';
import { cookieName } from '@holeauth/core/cookies';
import { createDispatcher, type DispatchOptions } from './dispatch.js';

export type NextHoleauth<
  Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
> = HoleauthInstance &
  PluginsApi<Plugins> & {
    handlers: {
      GET: (req: Request) => Promise<Response>;
      POST: (req: Request) => Promise<Response>;
    };
  };

export function createAuthHandler<
  const Plugins extends readonly HoleauthPlugin<string, unknown>[] = [],
>(
  config: HoleauthConfig & { plugins?: Plugins },
  opts: DispatchOptions = {},
): NextHoleauth<Plugins> {
  const base = defineHoleauth(config);

  /** RSC/server-component helper: read the current session via next/headers. */
  async function getSession() {
    const store = typeof cookies === 'function' ? await cookies() : cookies;
    const accessName = cookieName(config, 'access');
    const raw = (store as unknown as { get: (n: string) => { value?: string } | undefined }).get(accessName);
    const token = raw?.value;
    if (!token) return null;
    return sessionMod.validateSession(config, token);
  }

  const dispatch = createDispatcher(base, opts);

  return {
    ...base,
    handlers: { GET: dispatch, POST: dispatch },
    getSession: (accessToken?: string) => (accessToken ? base.getSession(accessToken) : getSession()),
  } as NextHoleauth<Plugins>;
}

export { createDispatcher } from './dispatch.js';
export type { DispatchOptions } from './dispatch.js';
export * from './cookies.js';
export * from './server.js';
export * from './refresh.js';
export type { HoleauthConfig } from '@holeauth/core';
