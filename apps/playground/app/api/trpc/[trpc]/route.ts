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
