import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { listUserSessions } from '@/lib/sessions';
import { Skeleton } from '@/app/skeleton';
import {
  revokeOwnSessionAction,
  revokeAllOtherSessionsAction,
} from './actions';

interface PageProps {
  searchParams: Promise<{ err?: string; ok?: string }>;
}

export default async function AccountSessionsPage({ searchParams }: PageProps) {
  const { err, ok } = await searchParams;
  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Active sessions</h1>
        <Link href="/" className="text-sm underline opacity-70">← Home</Link>
      </div>
      <p className="text-sm opacity-70">
        Every device you are currently signed in on. Revoking a session
        immediately invalidates its refresh token; the access token remains
        valid until it expires (max 15 min).
      </p>
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}
      {ok && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {ok}
        </div>
      )}
      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsBoundary />
      </Suspense>
    </main>
  );
}

function SessionsSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

async function SessionsBoundary() {
  const { session } = await validateCurrentRequest(auth, {
    redirectTo: '/login',
  });
  const rows = await listUserSessions(session.userId);
  const hasOthers = rows.some((r) => r.id !== session.sessionId);
  return (
    <div className="space-y-4">
      {hasOthers && (
        <form action={revokeAllOtherSessionsAction}>
          <button
            type="submit"
            className="rounded border px-3 py-1 text-sm hover:bg-red-50 dark:hover:bg-red-950"
          >
            Revoke all other sessions
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="italic opacity-60">No active sessions.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const isCurrent = r.id === session.sessionId;
            return (
              <li
                key={r.id}
                className={`rounded border p-3 ${
                  isCurrent
                    ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-center gap-2 text-sm">
                      <code className="text-xs opacity-70">{r.id.slice(0, 12)}…</code>
                      {isCurrent && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          this device
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs opacity-80" title={r.userAgent ?? ''}>
                      <span className="opacity-60">UA:</span> {r.userAgent ?? '—'}
                    </p>
                    <p className="text-xs opacity-80">
                      <span className="opacity-60">IP:</span> {r.ip ?? '—'}
                      <span className="mx-2 opacity-30">|</span>
                      <span className="opacity-60">Created:</span>{' '}
                      {r.createdAt?.toISOString().slice(0, 19).replace('T', ' ') ?? '—'}
                      <span className="mx-2 opacity-30">|</span>
                      <span className="opacity-60">Expires:</span>{' '}
                      {r.expiresAt.toISOString().slice(0, 19).replace('T', ' ')}
                    </p>
                  </div>
                  {!isCurrent && (
                    <form action={revokeOwnSessionAction}>
                      <input type="hidden" name="sessionId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded border px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        revoke
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
