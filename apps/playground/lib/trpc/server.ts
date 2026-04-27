/**
 * tRPC server — auth-aware context + reusable procedures.
 *
 * The context uses `getSessionOrRefresh` from `@holeauth/nextjs`, which:
 *   • validates the access cookie, or
 *   • transparently rotates the refresh cookie if the access token is
 *     missing/expired.
 *
 * When a rotation happens the fresh `Set-Cookie` headers are appended to the
 * outgoing response so the browser picks up the new tokens seamlessly — the
 * client doesn't have to do a thing.
 *
 * Exposed procedures:
 *   • `publicProcedure`   — no auth required (still carries session if any)
 *   • `authProcedure`     — requires a valid session (rejects UNAUTHORIZED)
 *   • `permissionProcedure(node | node[])` — auth + RBAC check
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { getSessionOrRefresh } from '@holeauth/nextjs';
import { auth } from '../auth';

/* ───────────────────────── Context ───────────────────────── */

export async function createTrpcContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  const { session, refreshed, setCookieHeaders } = await getSessionOrRefresh(req, auth);

  // If a refresh occurred, forward the rotated cookies on the tRPC response so
  // the browser keeps the user signed in without a round-trip to /auth/refresh.
  for (const c of setCookieHeaders) resHeaders.append('Set-Cookie', c);

  return {
    req,
    resHeaders,
    auth,
    session,
    /** True if the context rotated the refresh token for this call. */
    refreshed,
  };
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;

/* ───────────────────────── Init ───────────────────────── */

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/* ───────────────────────── Middlewares ───────────────────────── */

/** Auth middleware — rejects calls without a resolved session. */
const enforceSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No valid session. Sign in (or refresh) and try again.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId:
        (ctx.session as { sub?: string; userId?: string }).sub ??
        (ctx.session as { userId?: string }).userId!,
    },
  });
});

export const authProcedure = publicProcedure.use(enforceSession);

/** Narrow surface of the rbac plugin api we depend on. */
interface RbacShape {
  canAll(userId: string, nodes: string[]): Promise<boolean>;
  canAny(userId: string, nodes: string[]): Promise<boolean>;
}

function rbacApi(): RbacShape | null {
  const maybe = (auth as unknown as Record<string, unknown>)['rbac'];
  if (!maybe || typeof maybe !== 'object') return null;
  return maybe as RbacShape;
}

/**
 * Permission middleware factory.
 *
 * @param nodes  one or more permission paths (AND semantics)
 * @param mode   `'all'` (default) or `'any'` — OR semantics
 */
export function requirePermission(
  nodes: string | string[],
  mode: 'all' | 'any' = 'all',
) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return authProcedure.use(async ({ ctx, next }) => {
    const rbac = rbacApi();
    if (!rbac) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'RBAC plugin not installed.',
      });
    }
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
    return next({ ctx });
  });
}
