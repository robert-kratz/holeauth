---
name: integrate-holeauth-trpc
description: "Wire tRPC v11 into a holeauth-protected Next.js App Router app with auth-aware context, transparent refresh, and optional RBAC-gated procedures. Use when: adding tRPC, setting up tRPC with holeauth, auth-aware tRPC context, RBAC tRPC procedures, getSessionOrRefresh, tRPC refresh rotation."
argument-hint: "Inherits answers from integrate-holeauth"
---

# Integrate holeauth — tRPC

Adds tRPC v11 with `createHoleauthContext` (transparent refresh) and `makePermissionProcedure` (RBAC gate).

## Prerequisites

- `integrate-holeauth-core` complete
- Optionally `integrate-holeauth-rbac` if you want `permissionProcedure`

## Source of truth

- Reference: `apps/playground/lib/trpc/*` and `apps/playground/app/api/trpc/[trpc]/route.ts`
- Docs: `https://docs.holeauth.dev/docs/integrations/trpc`, `https://docs.holeauth.dev/docs/packages/trpc`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Default |
|---|---|---|---|
| 1 | `transformer` | radio | superjson (recommended) · None |
| 2 | `endpointPath` | text | `/api/trpc` |
| 3 | `addToProtectAllExcept` | radio | Yes (required for transparent refresh) · No |
| 4 | `useRbacProcedure` | radio | Yes (only valid if RBAC plugin present) · No |
| 5 | `clientIntegration` | radio | `@trpc/react-query` (recommended) · `@trpc/client` only |

---

### Step 2 — Install

```bash
pnpm add @trpc/server @trpc/client @trpc/react-query @tanstack/react-query @holeauth/trpc superjson
```

---

### Step 3 — Server context

`lib/trpc/server.ts`:

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { createHoleauthContext, makePermissionProcedure } from '@holeauth/trpc';
import { auth } from '@/lib/auth';

export const createTrpcContext = createHoleauthContext(auth);
export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires an authenticated session
export const authProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.userId,
    },
  });
});

// Only valid if RBAC plugin is registered:
export const permissionProcedure = makePermissionProcedure(authProcedure, auth.rbac);
```

---

### Step 4 — Router

`lib/trpc/router.ts`:

```ts
import { router, publicProcedure, authProcedure, permissionProcedure } from './server';

export const appRouter = router({
  hello: publicProcedure.query(() => 'world'),

  me: authProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    sessionId: ctx.session.sessionId,
  })),

  // Single permission:
  adminStats: permissionProcedure('admin.read').query(async () => {
    return { users: 42 };
  }),

  // Multiple permissions ('all' = AND, 'any' = OR):
  adminDangerous: permissionProcedure(['admin.write', 'admin.delete'], 'all').mutation(async () => {
    // ...
  }),
});

export type AppRouter = typeof appRouter;
```

---

### Step 5 — Route handler

`app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/router';
import { createTrpcContext } from '@/lib/trpc/server';

export const runtime = 'nodejs';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: (opts) => createTrpcContext(opts),
  });

export { handler as GET, handler as POST };
```

---

### Step 6 — Client setup

Create the typed React client and a provider component that wraps `@tanstack/react-query` + tRPC. Mount the provider inside `<HoleauthProvider>` in the root layout.

**The AI agent generates the client files in a platform-appropriate way.** Key requirements:
- `trpc` client export typed against `AppRouter`
- `TrpcProvider` uses `httpBatchLink` pointing at `<endpointPath>`
- `transformer: superjson` goes inside `httpBatchLink` (NOT at `createClient()` top-level — this is a v11 breaking change)
- Provider is mounted **inside** `<HoleauthProvider>` in the root layout

Docs: `https://docs.holeauth.dev/docs/packages/trpc#client`
Reference: `apps/playground/lib/trpc/` and `apps/playground/app/layout.tsx`

---

### Step 7 — Update middleware

`/api/trpc` MUST be in `protectAllExcept`:

```ts
protectAllExcept: [
  // ... existing entries
  '/api/trpc',
],
```

Otherwise the Next.js middleware will 302 the request to `/login` and the tRPC client will never see the 401 — bypassing the transparent refresh that `createHoleauthContext` performs.

---

## Hardcoded gotchas

1. **tRPC v11 transformer location.** `transformer` goes inside `httpBatchLink({ url, transformer })` on the client and inside `initTRPC...create({ transformer })` on the server. It is NOT a top-level argument of `createClient()`.
2. **`/api/trpc` must be in `protectAllExcept`.** The framework middleware would otherwise hijack 401s into 302 redirects, breaking transparent refresh.
3. **`makePermissionProcedure` requires `userId` already in context.** Always chain it off `authProcedure`, never off `publicProcedure`.
4. **Permission denied returns `FORBIDDEN`** (HTTP 403), not `UNAUTHORIZED`. Unauthenticated requests still get `UNAUTHORIZED` from `authProcedure`.
5. **`createHoleauthContext` performs transparent refresh** when the access token is expired but the refresh token is still valid. It sets `Set-Cookie` headers on `ctx.resHeaders` — your route handler propagation works automatically when using `fetchRequestHandler`.
6. **runtime = 'nodejs'** on the route handler — the context calls into adapters that may use Node-only deps.

---

## Verification checklist

```
[ ] pnpm install completed without peer-dep warnings
[ ] /api/trpc route handler responds to GET /api/trpc/hello
[ ] /api/trpc is in protectAllExcept in the middleware
[ ] authProcedure throws UNAUTHORIZED when called without a session
[ ] me procedure returns correct userId after sign-in
[ ] permissionProcedure throws FORBIDDEN for insufficient permissions (if RBAC selected)
[ ] TrpcProvider mounted inside HoleauthProvider in root layout
[ ] pnpm typecheck passes
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=trpc+<topic>
```

Useful topics: `refresh rotation`, `permission procedure`, `context`, `superjson`, `subscriptions`.
