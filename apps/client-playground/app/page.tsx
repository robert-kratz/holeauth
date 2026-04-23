import Link from 'next/link';
import { decodeJwt } from 'jose';
import { getCurrentSession } from '@/lib/session';
import { fetchUserInfo } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '—';
}

function Pre({ obj }: { obj: unknown }) {
  return (
    <pre className="overflow-x-auto rounded bg-slate-50 border text-xs p-3">
      {JSON.stringify(obj, null, 2)}
    </pre>
  );
}

export default async function Home() {
  const session = await getCurrentSession();

  if (!session) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Not signed in</h1>
        <p className="text-sm opacity-70">
          This is a third-party OIDC relying party. Sign in with the main
          holeauth playground running on port 3000.
        </p>
        <Link
          href="/login"
          className="inline-block rounded bg-indigo-600 px-4 py-2 text-white"
        >
          Sign in with Holeauth
        </Link>
      </main>
    );
  }

  const idClaims = session.idToken ? decodeJwt(session.idToken) : null;
  const accessClaims = (() => {
    try {
      return decodeJwt(session.accessToken);
    } catch {
      return null;
    }
  })();

  let userinfo: Record<string, unknown> | { error: string } = { error: 'not fetched' };
  try {
    userinfo = await fetchUserInfo(session.accessToken);
  } catch (e) {
    userinfo = { error: e instanceof Error ? e.message : String(e) };
  }

  return (
    <main className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">
          Hello {session.user.name ?? session.user.email ?? session.user.id}
        </h1>
        <p className="text-sm opacity-70">Signed in via OIDC against the main holeauth IdP.</p>
        <div className="flex flex-wrap gap-2">
          <form action="/api/refresh" method="post">
            <button className="rounded bg-slate-900 text-white px-3 py-1 text-sm">
              Refresh tokens
            </button>
          </form>
          <Link
            href="/logout"
            className="rounded border border-slate-300 px-3 py-1 text-sm"
          >
            Sign out
          </Link>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Session</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="pr-2 py-1 opacity-60">session id</td><td className="font-mono">{session.id}</td></tr>
            <tr><td className="pr-2 py-1 opacity-60">user id (sub)</td><td className="font-mono">{session.user.id}</td></tr>
            <tr><td className="pr-2 py-1 opacity-60">access expires</td><td>{fmtDate(session.accessExpiresAt)}</td></tr>
            <tr><td className="pr-2 py-1 opacity-60">refresh expires</td><td>{fmtDate(session.refreshExpiresAt)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">id_token claims</h2>
        <Pre obj={idClaims} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">access_token claims</h2>
        <Pre obj={accessClaims} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">/userinfo response</h2>
        <Pre obj={userinfo} />
      </section>
    </main>
  );
}
