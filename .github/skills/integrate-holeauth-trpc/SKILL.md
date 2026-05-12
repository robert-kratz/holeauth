---
name: integrate-holeauth-trpc
description: "Wire tRPC into a holeauth-protected Next.js app with auth-aware context, transparent refresh, and RBAC-gated procedures. Use when: adding tRPC, setting up tRPC with holeauth, auth-aware tRPC context, RBAC tRPC procedures, getSessionOrRefresh, tRPC refresh rotation."
argument-hint: "Requires integrate-holeauth-core. RBAC optional but unlocks permissionProcedure."
---

# Integrate holeauth — tRPC Bridge

Wires tRPC v11 procedures to a holeauth instance with:
- Transparent refresh-rotation in the request context (via `getSessionOrRefresh` from `@holeauth/nextjs`).
- `publicProcedure`, `authProcedure`, and (if RBAC is installed) `permissionProcedure(node | node[], 'all' | 'any')`.

> Reference: [apps/playground/lib/trpc/server.ts](apps/playground/lib/trpc/server.ts), [apps/playground/app/api/trpc/[trpc]/route.ts](apps/playground/app/api/trpc/%5Btrpc%5D/route.ts).

## Procedure

### Step 1 — tRPC-specific questions

1. **Transformer** — `trpcTransformer` — `superjson` *(recommended)* | `none`.
2. **Endpoint path** — `trpcEndpoint` — `/api/trpc` *(default)* | custom.
3. **Route protection** — `trpcAllowMiddleware` — confirm `'/api/trpc'` is on the holeauth `protectAllExcept` allow-list (otherwise the middleware redirects 401s before tRPC sees them).
4. **Use RBAC procedure** — `trpcRbac` — Yes (auto if `plugin-rbac` selected) | No.
5. **Client integration** — `trpcClient` — `@trpc/react-query (TanStack Query)` *(default)* | `Vanilla client only`.

### Step 2 — Install

```
@trpc/server @trpc/client @trpc/react-query
@tanstack/react-query
@holeauth/trpc             # auth-aware context factory + permissionProcedure helper
superjson                # if transformer = superjson
```

### Step 3 — Server context (fully-filled)

```ts title="lib/trpc/server.ts"
import { createHoleauthContext, makePermissionProcedure } from '@holeauth/trpc';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { auth } from '../auth';

// createHoleauthContext calls getSessionOrRefresh and forwards Set-Cookie headers.
export const createTrpcContext = createHoleauthContext(auth);
export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router          = t.router;
export const publicProcedure = t.procedure;

const enforceSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session, userId: ctx.session.sub! } });
});

export const authProcedure = publicProcedure.use(enforceSession);

// makePermissionProcedure requires auth.rbac — only add if RBAC plugin is installed.
// auth.rbac is fully typed via PluginsApi inference; no cast needed.
export const permissionProcedure = makePermissionProcedure(authProcedure, auth.rbac);
```

### Step 4 — Router

```ts title="lib/trpc/router.ts"
import { z } from 'zod';
import { router, publicProcedure, authProcedure, permissionProcedure } from './server';

export const appRouter = router({
  hello: publicProcedure.input(z.object({ name: z.string() })).query(({ input }) => `hi ${input.name}`),
  me:    authProcedure.query(({ ctx }) => ({ userId: ctx.userId })),
  admin: permissionProcedure(['admin.read'], 'all').query(() => 'ok'),
});

export type AppRouter = typeof appRouter;
```

### Step 5 — Route handler

```ts title="app/api/trpc/[trpc]/route.ts"
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/router';
import { createTrpcContext } from '@/lib/trpc/server';

export const runtime = 'nodejs';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTrpcContext,
    onError({ error, path }) {
      // eslint-disable-next-line no-console
      console.error(`[trpc] ${path ?? '<?>'}:`, error.code, error.message);
    },
  });

export { handler as GET, handler as POST };
```

### Step 6 — Client provider

```tsx title="lib/trpc/provider.tsx"
'use client';
import { useState, type ReactNode } from 'react';
import { httpBatchLink } from '@trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc/client';

export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [httpBatchLink({ url: '/api/trpc' })],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

```ts title="lib/trpc/client.ts"
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const trpc = createTRPCReact<AppRouter>();
```

Mount inside `<HoleauthProvider>` in `app/layout.tsx`.

### Step 7 — Middleware integration

Ensure `'/api/trpc'` is in the `protectAllExcept` list of `holeauthMiddleware` so tRPC owns its own 401 responses (and can run the refresh rotation in the context).

### Step 8 — Verify

- `trpc.hello.useQuery({ name: 'World' })` works for anonymous callers.
- `trpc.me.useQuery()` returns `{ userId }` for authenticated callers, `UNAUTHORIZED` otherwise.
- Letting the access token expire still works on the next call: `getSessionOrRefresh` rotates and the `Set-Cookie` headers come back on the tRPC response.
- `permissionProcedure` returns `FORBIDDEN` when the user lacks the node.

## Key references

- [apps/playground/lib/trpc/server.ts](apps/playground/lib/trpc/server.ts)
- [apps/playground/lib/trpc/provider.tsx](apps/playground/lib/trpc/provider.tsx)
- [apps/playground/app/api/trpc/[trpc]/route.ts](apps/playground/app/api/trpc/%5Btrpc%5D/route.ts)
- `packages/nextjs/src/refresh.ts` — `getSessionOrRefresh`
