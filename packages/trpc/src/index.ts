/**
 * @holeauth/trpc
 *
 * Typed tRPC helpers for holeauth:
 *
 * - `createHoleauthContext(auth)` — factory that returns a tRPC context
 *   creator with transparent session refresh and typed auth instance.
 *
 * - `makePermissionProcedure(authProcedure, rbac)` — returns a
 *   `(nodes, mode?) => procedure` factory that gates the procedure on
 *   RBAC permissions. Throws `FORBIDDEN` when the check fails.
 *
 * @example
 * ```ts
 * // lib/trpc/server.ts
 * import { createHoleauthContext, makePermissionProcedure } from '@holeauth/trpc';
 * import { auth } from '../auth';
 *
 * export const createTrpcContext = createHoleauthContext(auth);
 * export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
 *
 * const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
 * export const router = t.router;
 * export const publicProcedure = t.procedure;
 *
 * const enforceSession = t.middleware(({ ctx, next }) => {
 *   if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
 *   return next({ ctx: { ...ctx, session: ctx.session, userId: ctx.session.sub! } });
 * });
 * export const authProcedure = publicProcedure.use(enforceSession);
 *
 * export const permissionProcedure = makePermissionProcedure(authProcedure, auth.rbac);
 * // Usage: permissionProcedure('post.create')
 * //        permissionProcedure(['post.read', 'post.write'], 'any')
 * ```
 */

import type { HoleauthInstance, SessionData } from '@holeauth/core';
import { getSessionOrRefreshFromRequest } from '@holeauth/core/session';
import { TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

/* ── Types ──────────────────────────────────────────────────────────────── */

/** The holeauth-specific fields injected into every tRPC context. */
export interface HoleauthTrpcContext<Auth extends HoleauthInstance> {
  /** The full, typed auth instance (including plugin namespaces like `auth.rbac`). */
  auth: Auth;
  /** Resolved session for the current request, or `null` when unauthenticated. */
  session: SessionData | null;
  /** Whether a silent token rotation happened. */
  refreshed: boolean;
  req: Request;
  resHeaders: Headers;
}

/** Minimal RBAC surface required by `makePermissionProcedure`. */
export interface RbacLike {
  canAll(userId: string, nodes: string[]): Promise<boolean>;
  canAny(userId: string, nodes: string[]): Promise<boolean>;
}

/* ── createHoleauthContext ──────────────────────────────────────────────── */

/**
 * Creates a typed tRPC context factory for `@trpc/server/adapters/fetch`.
 *
 * Transparently rotates the access token when it's expired (using the
 * refresh cookie) and propagates the new `Set-Cookie` headers onto
 * `resHeaders` so the client receives fresh cookies.
 *
 * @param auth - The holeauth instance returned by `createAuthHandler()`.
 *
 * @example
 * ```ts
 * export const createTrpcContext = createHoleauthContext(auth);
 * export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
 * ```
 */
export function createHoleauthContext<Auth extends HoleauthInstance>(
  auth: Auth,
): (opts: FetchCreateContextFnOptions) => Promise<HoleauthTrpcContext<Auth>> {
  return async function holeauthContext({
    req,
    resHeaders,
  }: FetchCreateContextFnOptions): Promise<HoleauthTrpcContext<Auth>> {
    const { session, refreshed, setCookieHeaders } = await getSessionOrRefreshFromRequest(
      req,
      auth,
    );
    for (const c of setCookieHeaders) {
      resHeaders.append('Set-Cookie', c);
    }
    return { auth, session, refreshed, req, resHeaders };
  };
}

/* ── makePermissionProcedure ────────────────────────────────────────────── */

/**
 * Shape of tRPC procedure builder sufficient for permission gating.
 * Intentionally loose — preserves the caller's full generic type by using
 * structural typing rather than importing tRPC internals.
 *
 * @internal
 */
type ProcedureWithUse<Ctx extends { userId: string }> = {
  use<Result>(
    fn: (opts: {
      ctx: Ctx;
      next: (nextOpts?: { ctx?: Ctx }) => Promise<Result>;
    }) => Promise<Result>,
  ): ProcedureWithUse<Ctx>;
};

/**
 * Creates a `(nodes, mode?) => procedure` factory from an authenticated
 * tRPC procedure and an RBAC API surface.
 *
 * The factory uses `canAll` (default) or `canAny` depending on `mode` and
 * throws a `FORBIDDEN` error when the user lacks the required permissions.
 *
 * @param authProcedure - A tRPC procedure builder whose context already
 *   contains `userId: string` (i.e. it has an auth middleware applied).
 * @param rbac - The RBAC API (e.g. `auth.rbac` when using `@holeauth/plugin-rbac`).
 *
 * @example
 * ```ts
 * export const permissionProcedure = makePermissionProcedure(authProcedure, auth.rbac);
 *
 * // In a router:
 * const posts = router({
 *   create: permissionProcedure('post.create').mutation(({ ctx, input }) => { ... }),
 *   list:   permissionProcedure(['post.read', 'post.list'], 'any').query(({ ctx }) => { ... }),
 * });
 * ```
 */
export function makePermissionProcedure<Ctx extends { userId: string }>(
  authProcedure: ProcedureWithUse<Ctx>,
  rbac: RbacLike,
): (nodes: string | string[], mode?: 'all' | 'any') => ProcedureWithUse<Ctx> {
  return (nodes, mode = 'all') => {
    const list = Array.isArray(nodes) ? nodes : [nodes];
    return authProcedure.use(async ({ ctx, next }) => {
      const ok =
        mode === 'any'
          ? await rbac.canAny(ctx.userId, list)
          : await rbac.canAll(ctx.userId, list);
      if (!ok) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Missing permission(s): ${list.join(', ')}`,
        });
      }
      return next();
    });
  };
}
