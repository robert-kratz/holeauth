import { TrpcProvider } from '@/lib/trpc/provider';
import { TrpcDemo } from './trpc-demo';

export const metadata = { title: 'tRPC demo — holeauth playground' };

export default function TrpcDemoPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">tRPC + holeauth demo</h1>
      <p className="text-sm text-gray-600">
        Each procedure is wired to a holeauth middleware:
        <code> publicProcedure</code>, <code>authProcedure</code>,{' '}
        <code>requirePermission(&hellip;)</code>. Expire your access cookie in
        DevTools and click &ldquo;Refetch&rdquo; — the request still succeeds
        because the context refreshes the session using the refresh cookie.
      </p>
      <TrpcProvider>
        <TrpcDemo />
      </TrpcProvider>
    </div>
  );
}
