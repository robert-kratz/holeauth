import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { Skeleton } from '@/app/skeleton';

export default async function DeveloperAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">OAuth apps</h1>
        <Link href="/" className="text-sm underline opacity-70">← Home</Link>
      </div>
      <p className="text-sm opacity-70">
        Apps you own here can issue OIDC tokens via <code>/api/auth/oauth2/*</code>.
        Each app belongs to a team; creating your first app will create a
        personal team automatically.
      </p>
      {ok && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {ok}
        </div>
      )}
      <div>
        <Link
          href="/developer/apps/new"
          className="inline-block rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
        >
          + New app
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Listing />
      </Suspense>
    </main>
  );
}

async function Listing() {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const apps = await auth.idp.apps.listForUser(session.userId);
  if (apps.length === 0) {
    return (
      <p className="text-sm opacity-70 italic">
        You have no apps yet. Create one to get a <code>client_id</code>.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1">Name</th>
          <th>Type</th>
          <th>Client ID</th>
          <th>Redirects</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {apps.map((a) => (
          <tr key={a.id} className="border-b">
            <td className="py-2">
              <Link className="underline" href={`/developer/apps/${a.id}`}>
                {a.name}
              </Link>
            </td>
            <td>{a.type}</td>
            <td className="font-mono text-xs">{a.id}</td>
            <td className="text-xs">{a.redirectUris.length}</td>
            <td>{a.disabledAt ? 'disabled' : 'active'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
