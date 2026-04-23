import { Suspense } from 'react';
import Link from 'next/link';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { getTwofa } from '@/lib/plugins';
import { Skeleton } from '@/app/skeleton';
import { TwoFactorSetupClient } from './setup-client';

export default function TwoFactorSetupPage() {
  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
        <Link href="/" className="text-sm underline opacity-70">← Home</Link>
      </div>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <StatusBoundary />
      </Suspense>
    </main>
  );
}

async function StatusBoundary() {
  const { session } = await validateCurrentRequest(auth, { redirectTo: '/login' });
  const enabled = await getTwofa().isEnabled(session.userId);
  return (
    <div className="space-y-6">
      <div
        className={`rounded border px-3 py-2 text-sm flex items-center gap-2 ${
          enabled
            ? 'border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200'
            : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
        }`}
      >
        <span className="text-lg leading-none">{enabled ? '✓' : '○'}</span>
        <span>
          {enabled ? '2FA is enabled for your account.' : '2FA is not enabled for your account.'}
        </span>
      </div>
      <TwoFactorSetupClient initiallyEnabled={enabled} />
    </div>
  );
}
