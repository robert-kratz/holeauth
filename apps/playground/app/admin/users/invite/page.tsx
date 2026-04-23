import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { Skeleton } from '@/app/skeleton';
import { InviteForm } from './InviteForm';

export default function AdminInviteUserPage() {
  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Invite user</h1>
        <Link href="/admin/users" className="text-sm underline opacity-70">← Users</Link>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Boundary />
      </Suspense>
    </main>
  );
}

async function Boundary() {
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.invite'],
    redirectTo: '/login',
  });
  const groups = auth.rbac.listGroups().map((g) => ({
    id: g.id,
    displayName: g.displayName ?? g.id,
    isDefault: !!g.default,
  }));
  return <InviteForm groups={groups} />;
}
