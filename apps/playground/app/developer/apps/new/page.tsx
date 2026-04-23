import Link from 'next/link';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { createAppAction } from './actions';

export default async function NewAppPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  await validateCurrentRequest(auth, {
    permissions: ['idp.apps.create'],
    redirectTo: '/login',
  });
  const { err } = await searchParams;
  return (
    <main className="max-w-lg space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Create OAuth app</h1>
        <Link href="/developer/apps" className="text-sm underline opacity-70">
          ← Apps
        </Link>
      </div>
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}
      <form action={createAppAction} className="space-y-3">
        <Field label="Name" name="name" required placeholder="My client app" />
        <Field label="Description" name="description" placeholder="optional" />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Type</span>
          <select name="type" className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="confidential">confidential (has client_secret)</option>
            <option value="public">public (PKCE only, no secret)</option>
          </select>
        </label>
        <Field
          label="Redirect URIs (one per line)"
          name="redirectUris"
          textarea
          required
          placeholder="http://localhost:3001/oidc/callback"
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Require PKCE</span>
          <input type="checkbox" name="requirePkce" defaultChecked />
        </label>
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
        >
          Create app
        </button>
      </form>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{props.label}</span>
      {props.textarea ? (
        <textarea
          name={props.name}
          required={props.required}
          placeholder={props.placeholder}
          className="w-full rounded border px-2 py-1.5 font-mono text-xs"
          rows={4}
        />
      ) : (
        <input
          name={props.name}
          required={props.required}
          placeholder={props.placeholder}
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}
