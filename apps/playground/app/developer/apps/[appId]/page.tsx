import Link from 'next/link';
import { notFound } from 'next/navigation';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import {
  regenerateSecretAction,
  updateAppAction,
  deleteAppAction,
  toggleDisabledAction,
} from './actions';

interface Props {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ secret?: string; ok?: string; err?: string }>;
}

export default async function AppDetailPage({ params, searchParams }: Props) {
  const { appId } = await params;
  const { secret, ok, err } = await searchParams;

  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });

  let app;
  try {
    app = await auth.idp.apps.get(session.userId, appId);
  } catch {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{app.name}</h1>
        <Link href="/developer/apps" className="text-sm underline opacity-70">
          ← Apps
        </Link>
      </div>

      {secret && (
        <div className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950/40">
          <p className="font-medium">client_secret (copy now — shown only once):</p>
          <code className="mt-1 block break-all font-mono text-xs">{secret}</code>
        </div>
      )}
      {ok && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {ok}
        </div>
      )}
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase opacity-70">Credentials</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="opacity-70">client_id</dt>
          <dd className="font-mono text-xs">{app.id}</dd>
          <dt className="opacity-70">type</dt>
          <dd>{app.type}</dd>
          <dt className="opacity-70">issuer</dt>
          <dd className="font-mono text-xs">{auth.idp.meta.issuer}</dd>
          <dt className="opacity-70">discovery</dt>
          <dd className="font-mono text-xs">
            {auth.idp.meta.issuer}/.well-known/openid-configuration
          </dd>
        </dl>
        {app.type === 'confidential' && (
          <form action={regenerateSecretAction} className="pt-2">
            <input type="hidden" name="appId" value={app.id} />
            <button
              type="submit"
              className="rounded border px-2 py-1 text-xs"
            >
              Regenerate client_secret
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase opacity-70">Configuration</h2>
        <form action={updateAppAction} className="space-y-2">
          <input type="hidden" name="appId" value={app.id} />
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Name</span>
            <input
              name="name"
              defaultValue={app.name}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Description</span>
            <input
              name="description"
              defaultValue={app.description ?? ''}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Redirect URIs (one per line)</span>
            <textarea
              name="redirectUris"
              defaultValue={app.redirectUris.join('\n')}
              rows={4}
              className="w-full rounded border px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Allowed scopes (space-separated)</span>
            <input
              name="allowedScopes"
              defaultValue={app.allowedScopes.join(' ')}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requirePkce"
              defaultChecked={app.requirePkce}
            />
            Require PKCE
          </label>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase opacity-70">Dangerous</h2>
        <div className="flex gap-2">
          <form action={toggleDisabledAction}>
            <input type="hidden" name="appId" value={app.id} />
            <input
              type="hidden"
              name="disabled"
              value={app.disabledAt ? 'false' : 'true'}
            />
            <button className="rounded border px-2 py-1 text-xs">
              {app.disabledAt ? 'Enable app' : 'Disable app'}
            </button>
          </form>
          <form action={deleteAppAction}>
            <input type="hidden" name="appId" value={app.id} />
            <button className="rounded border border-red-500 px-2 py-1 text-xs text-red-600">
              Delete app
            </button>
          </form>
          <Link
            href={`/developer/apps/${app.id}/tokens`}
            className="rounded border px-2 py-1 text-xs"
          >
            View active tokens →
          </Link>
        </div>
      </section>
    </main>
  );
}
