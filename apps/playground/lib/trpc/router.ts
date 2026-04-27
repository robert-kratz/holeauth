/**
 * Example tRPC router wired to the holeauth middlewares.
 *
 * Demonstrates:
 *   1. `hello`      — public; no auth required.
 *   2. `me`         — requires a session. If the access cookie is expired
 *                      but a refresh cookie is present, the context will
 *                      rotate it transparently (see `createTrpcContext`).
 *   3. `secretData` — requires the `posts.read` permission (RBAC plugin).
 *   4. `adminPing`  — requires `admin.read`.
 */
import { z } from 'zod';
import {
  router,
  publicProcedure,
  authProcedure,
  requirePermission,
} from './server';

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().min(1).max(64).optional() }).optional())
    .query(({ input }) => ({
      message: `Hello, ${input?.name ?? 'stranger'}!`,
      at: new Date().toISOString(),
    })),

  me: authProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    session: ctx.session,
    refreshed: ctx.refreshed,
  })),

  secretData: requirePermission('posts.read').query(({ ctx }) => ({
    userId: ctx.userId,
    payload: 'top-secret stuff only posts.read holders can see',
    refreshed: ctx.refreshed,
  })),

  adminPing: requirePermission('admin.read').mutation(() => ({
    pong: true,
    at: new Date().toISOString(),
  })),
});

export type AppRouter = typeof appRouter;
