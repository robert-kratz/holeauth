import Link from 'next/link';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { rotateKeysAction } from './actions';

export default async function AdminIdpPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await validateCurrentRequest(auth, {
    permissions: ['idp.apps.admin'],
    redirectTo: '/login',
  });
  const { ok } = await searchParams;
  const apps = await auth.idp.apps.listAll();

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">IdP admin</h1>
        <Link href="/admin" className="text-sm underline opacity-70">← Admin</Link>
      </div>
      {ok && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {ok}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase opacity-70">Signing keys</h2>
        <form action={rotateKeysAction}>
          <button className="rounded border px-2 py-1 text-xs">
            Rotate signing key
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase opacity-70">
          Registered apps ({apps.length})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">Name</th>
              <th>Type</th>
              <th>Client ID</th>
              <th>Team</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2">{a.name}</td>
                <td>{a.type}</td>
                <td className="font-mono text-xs">{a.id}</td>
                <td className="font-mono text-xs">{a.teamId}</td>
                <td>{a.disabledAt ? 'disabled' : 'active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
