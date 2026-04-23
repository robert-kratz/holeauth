import Link from 'next/link';
import { Suspense } from 'react';
import { revalidatePath } from 'next/cache';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { getPasskey } from '@/lib/plugins';
import { Skeleton } from '@/app/skeleton';

export default function PasskeysPage() {
  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Passkeys</h1>
        <Link href="/" className="text-sm underline opacity-70">← Home</Link>
      </div>
      <p className="text-sm opacity-70">
        Passkeys currently registered on your account. Each one represents a device or
        password manager that can sign you in without a password.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <ListBoundary />
      </Suspense>
      <div>
        <Link
          href="/passkey/register"
          className="inline-block rounded border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
        >
          + Register another passkey
        </Link>
      </div>
    </main>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

async function ListBoundary() {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const records = await getPasskey().list(session.userId);

  if (records.length === 0) {
    return (
      <div className="rounded border p-4 text-sm italic opacity-70">
        — no passkeys registered —
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between gap-3 rounded border p-3"
        >
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {p.deviceName ?? '(unnamed device)'}
            </p>
            <p className="text-xs opacity-60 font-mono truncate">
              id: {p.credentialId}
            </p>
            {p.createdAt && (
              <p className="text-xs opacity-60">
                Added {p.createdAt.toISOString().slice(0, 19).replace('T', ' ')}
              </p>
            )}
          </div>
          <form action={deletePasskeyAction}>
            <input type="hidden" name="credentialId" value={p.credentialId} />
            <button
              type="submit"
              className="rounded border px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950"
            >
              remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function deletePasskeyAction(formData: FormData) {
  'use server';
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const credentialId = String(formData.get('credentialId') ?? '');
  if (!credentialId) return;
  await getPasskey().delete(session.userId, credentialId);
  revalidatePath('/passkey');
}
