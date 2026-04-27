'use client';
import { trpc } from '@/lib/trpc/client';

export function TrpcDemo() {
  const hello = trpc.hello.useQuery({ name: 'holeauth' });
  const me = trpc.me.useQuery(undefined, { retry: false });
  const secret = trpc.secretData.useQuery(undefined, { retry: false });
  const adminPing = trpc.adminPing.useMutation();

  return (
    <div className="space-y-6">
      <section className="rounded border p-4">
        <h2 className="font-semibold">hello (public)</h2>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(hello.data ?? hello.error?.message ?? '…', null, 2)}
        </pre>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">me (authProcedure)</h2>
        <p className="text-sm text-gray-600">
          Requires a valid session. If the access cookie is expired but a refresh
          cookie is present, the tRPC context rotates it transparently and the
          request succeeds with <code>refreshed: true</code>.
        </p>
        <button
          className="mt-2 rounded border px-3 py-1 text-sm"
          onClick={() => void me.refetch()}
        >
          Refetch
        </button>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(me.data ?? me.error?.message ?? '…', null, 2)}
        </pre>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">secretData (requirePermission: posts.read)</h2>
        <button
          className="mt-2 rounded border px-3 py-1 text-sm"
          onClick={() => void secret.refetch()}
        >
          Refetch
        </button>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(secret.data ?? secret.error?.message ?? '…', null, 2)}
        </pre>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">adminPing (requirePermission: admin.read)</h2>
        <button
          className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={adminPing.isPending}
          onClick={() => adminPing.mutate()}
        >
          Call
        </button>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(
            adminPing.data ?? adminPing.error?.message ?? '…',
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}
