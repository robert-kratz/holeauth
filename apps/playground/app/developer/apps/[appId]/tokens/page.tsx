import Link from 'next/link';
import { notFound } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { revokeAllTokensAction } from './actions';

export default async function AppTokensPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { appId } = await params;
  const { ok } = await searchParams;
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  try {
    await auth.idp.apps.get(session.userId, appId);
  } catch {
    notFound();
  }
  const tokens = await auth.idp.tokens.listForApp(session.userId, appId);

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Issued refresh tokens</h1>
        <Link href={`/developer/apps/${appId}`} className="text-sm underline opacity-70">
          ← App
        </Link>
      </div>
      {ok && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {ok}
        </div>
      )}
      <form action={revokeAllTokensAction}>
        <input type="hidden" name="appId" value={appId} />
        <button className="rounded border border-red-500 px-2 py-1 text-xs text-red-600">
          Revoke all refresh tokens
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">User ID</th>
            <th>Family</th>
            <th>Scope</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2 font-mono text-xs">{t.userId}</td>
              <td className="font-mono text-xs">{t.familyId.slice(0, 8)}…</td>
              <td className="text-xs">{t.scope}</td>
              <td className="text-xs">{t.createdAt.toISOString().slice(0, 19)}</td>
              <td className="text-xs">{t.expiresAt.toISOString().slice(0, 19)}</td>
              <td className="text-xs">
                {t.revokedAt ? t.revokedAt.toISOString().slice(0, 19) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
