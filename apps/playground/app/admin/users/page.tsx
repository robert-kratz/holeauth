import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { Skeleton } from '@/app/skeleton';
import { InvitesPanel } from './InvitesPanel';

export default function AdminUsersPage() {
  return (
    <main className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/users/invite"
            className="rounded bg-black px-3 py-1.5 text-white text-sm"
          >
            + Invite user
          </Link>
          <Link href="/admin" className="text-sm underline opacity-70">← Admin</Link>
        </div>
      </div>
      <Suspense fallback={<UsersSkeleton />}>
        <UsersBoundary />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <InvitesBoundary />
      </Suspense>
    </main>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

async function UsersBoundary() {
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.read'],
    redirectTo: '/login',
  });
  const rows = await db.select().from(users).limit(100);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th>ID</th>
          <th>Email</th>
          <th>Name</th>
          <th>Created</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} className="border-b">
            <td className="py-2"><code>{u.id.slice(0, 8)}…</code></td>
            <td>{u.email}</td>
            <td>{u.name ?? '—'}</td>
            <td>{u.createdAt?.toISOString().slice(0, 10) ?? '—'}</td>
            <td className="text-right">
              <Link
                href={`/admin/users/${u.id}`}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                manage →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function InvitesBoundary() {
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.read'],
    redirectTo: '/login',
  });
  const invites = await auth.listInvites();
  return <InvitesPanel invites={invites} />;
}
