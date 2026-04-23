import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { listAllSessions } from '@/lib/sessions';
import { Skeleton } from '@/app/skeleton';
import { adminRevokeSessionAction } from './actions';

interface PageProps {
  searchParams: Promise<{ err?: string; includeRevoked?: string }>;
}

export default async function AdminSessionsPage({ searchParams }: PageProps) {
  const { err, includeRevoked } = await searchParams;
  const showRevoked = includeRevoked === '1';
  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <Link href="/admin" className="text-sm underline opacity-70">← Admin</Link>
      </div>
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}
      <p className="text-sm opacity-70">
        Every session across all users.{' '}
        <Link
          href={showRevoked ? '/admin/sessions' : '/admin/sessions?includeRevoked=1'}
          className="underline"
        >
          {showRevoked ? 'Hide revoked' : 'Include revoked'}
        </Link>
      </p>
      <Suspense fallback={<TableSkeleton />}>
        <TableBoundary includeRevoked={showRevoked} />
      </Suspense>
    </main>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

async function TableBoundary({ includeRevoked }: { includeRevoked: boolean }) {
  const { session: currentSession } = await validateCurrentRequest(auth, {
    permissions: ['admin.sessions.read'],
    redirectTo: '/login',
  });
  const rows = await listAllSessions({ includeRevoked, limit: 500 });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1">ID</th>
          <th>User</th>
          <th>User-Agent</th>
          <th>IP</th>
          <th>Created</th>
          <th>Expires</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isCurrent = r.id === currentSession.sessionId;
          const revoked = r.revokedAt != null;
          return (
            <tr key={r.id} className="border-b align-top">
              <td className="py-2">
                <code className="text-xs">{r.id.slice(0, 8)}…</code>
              </td>
              <td className="pr-2">
                <Link
                  href={`/admin/users/${r.userId}`}
                  className="underline opacity-80 hover:opacity-100"
                >
                  {r.userEmail ?? r.userId.slice(0, 8) + '…'}
                </Link>
              </td>
              <td className="max-w-[220px] truncate pr-2 text-xs" title={r.userAgent ?? ''}>
                {r.userAgent ?? '—'}
              </td>
              <td className="pr-2 text-xs">{r.ip ?? '—'}</td>
              <td className="pr-2 text-xs">
                {r.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
              </td>
              <td className="pr-2 text-xs">
                {r.expiresAt.toISOString().slice(0, 16).replace('T', ' ')}
              </td>
              <td className="pr-2 text-xs">
                {revoked ? (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                    revoked
                  </span>
                ) : isCurrent ? (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    you
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                    active
                  </span>
                )}
              </td>
              <td className="py-2 text-right">
                {!revoked && !isCurrent && (
                  <form action={adminRevokeSessionAction}>
                    <input type="hidden" name="sessionId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      revoke
                    </button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
