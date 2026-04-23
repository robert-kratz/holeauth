import Link from 'next/link';
import { Suspense } from 'react';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { getRbac } from '@/lib/rbac';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { Skeleton } from '@/app/skeleton';

interface PageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ err?: string }>;
}

export default async function AdminUserDetailPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const { err } = await searchParams;
  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">User</h1>
        <Link href="/admin/users" className="text-sm underline opacity-70">← Users</Link>
      </div>
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}
      <Suspense fallback={<DetailSkeleton />}>
        <UserDetailBoundary userId={userId} />
      </Suspense>
    </main>
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Unknown error';
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

async function UserDetailBoundary({ userId }: { userId: string }) {
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.read'],
    redirectTo: '/login',
  });

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) notFound();

  const rbac = getRbac();
  const { groups: allGroups, defaultGroupId } = rbac.snapshot();
  const [userGroups, directPerms, effective] = await Promise.all([
    rbac.getUserGroups(userId),
    rbac.getUserPermissions(userId),
    rbac.getEffectiveNodes(userId),
  ]);

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const assignableGroups = allGroups.filter(
    (g) => !userGroupIds.has(g.id) && g.id !== defaultGroupId,
  );

  return (
    <div className="space-y-8">
      {/* ── identity ───────────────────────────────────────────── */}
      <section className="rounded border p-4 space-y-1">
        <p className="text-sm">
          <span className="opacity-60">ID:</span> <code>{user.id}</code>
        </p>
        <p className="text-sm">
          <span className="opacity-60">Email:</span> {user.email}
        </p>
        <p className="text-sm">
          <span className="opacity-60">Name:</span> {user.name ?? '—'}
        </p>
        <p className="text-sm">
          <span className="opacity-60">Created:</span>{' '}
          {user.createdAt?.toISOString().slice(0, 19).replace('T', ' ') ?? '—'}
        </p>
      </section>

      {/* ── groups ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Groups</h2>
          <Link href="/admin/rbac" className="text-xs underline opacity-70">
            view all →
          </Link>
        </div>

        {userGroups.length === 0 ? (
          <p className="text-sm italic opacity-60">— no groups —</p>
        ) : (
          <ul className="space-y-2">
            {userGroups.map((g) => {
              const isDefault = g.id === defaultGroupId;
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded border p-3"
                >
                  <div>
                    <span className="font-mono text-sm">{g.id}</span>
                    {isDefault && (
                      <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        default
                      </span>
                    )}
                    {g.displayName && (
                      <span className="ml-2 text-xs opacity-70">{g.displayName}</span>
                    )}
                  </div>
                  {!isDefault && (
                    <form action={removeGroupAction}>
                      <input type="hidden" name="userId" value={userId} />
                      <input type="hidden" name="groupId" value={g.id} />
                      <button
                        type="submit"
                        className="rounded border px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        remove
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {assignableGroups.length > 0 && (
          <form action={assignGroupAction} className="flex gap-2">
            <input type="hidden" name="userId" value={userId} />
            <select
              name="groupId"
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Select group to assign…
              </option>
              {assignableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id}
                  {g.displayName ? ` — ${g.displayName}` : ''}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Assign
            </button>
          </form>
        )}
      </section>

      {/* ── direct permissions ─────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Direct permissions</h2>
        <p className="text-xs opacity-60">
          Per-user overrides applied on top of group permissions. Prefix with{' '}
          <code>!</code> to negate.
        </p>

        {directPerms.length === 0 ? (
          <p className="text-sm italic opacity-60">— none —</p>
        ) : (
          <ul className="space-y-1">
            {directPerms.map((node) => {
              const negated = node.startsWith('!');
              return (
                <li
                  key={node}
                  className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                >
                  <span
                    className={`font-mono text-xs ${
                      negated ? 'text-red-700 dark:text-red-300' : ''
                    }`}
                  >
                    {node}
                  </span>
                  <form action={revokePermissionAction}>
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="node" value={node} />
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      revoke
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={grantPermissionAction} className="flex gap-2">
          <input type="hidden" name="userId" value={userId} />
          <input
            type="text"
            name="node"
            placeholder="e.g. posts.edit  or  !admin.delete"
            pattern="!?[A-Za-z0-9_.\-*]+"
            required
            className="flex-1 rounded border bg-transparent px-2 py-1 text-sm font-mono"
          />
          <button
            type="submit"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            Grant
          </button>
        </form>
      </section>

      {/* ── effective ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Effective permissions</h2>
        <p className="text-xs opacity-60">
          Resolved set ({effective.length}) — group permissions ordered by priority,
          followed by direct overrides.
        </p>
        {effective.length === 0 ? (
          <p className="text-sm italic opacity-60">— none —</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {effective.map((n, i) => {
              const negated = n.startsWith('!');
              return (
                <li
                  key={`${n}-${i}`}
                  className={`rounded px-2 py-0.5 font-mono text-xs ${
                    negated
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}
                >
                  {n}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ──────────────────────────── server actions ──────────────────────────── */

async function assignGroupAction(formData: FormData) {
  'use server';
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.write'],
    redirectTo: '/login',
  });
  const userId = String(formData.get('userId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  if (!userId || !groupId) return;
  try {
    await getRbac().assignGroup(userId, groupId);
  } catch (e) {
    redirect(`/admin/users/${userId}?err=${encodeURIComponent(errorMessage(e))}`);
  }
  revalidatePath(`/admin/users/${userId}`);
}

async function removeGroupAction(formData: FormData) {
  'use server';
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.write'],
    redirectTo: '/login',
  });
  const userId = String(formData.get('userId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  if (!userId || !groupId) return;
  try {
    await getRbac().removeGroup(userId, groupId);
  } catch (e) {
    redirect(`/admin/users/${userId}?err=${encodeURIComponent(errorMessage(e))}`);
  }
  revalidatePath(`/admin/users/${userId}`);
}

async function grantPermissionAction(formData: FormData) {
  'use server';
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.write'],
    redirectTo: '/login',
  });
  const userId = String(formData.get('userId') ?? '');
  const node = String(formData.get('node') ?? '').trim();
  if (!userId || !node) return;
  try {
    await getRbac().grant(userId, node);
  } catch (e) {
    redirect(`/admin/users/${userId}?err=${encodeURIComponent(errorMessage(e))}`);
  }
  revalidatePath(`/admin/users/${userId}`);
}

async function revokePermissionAction(formData: FormData) {
  'use server';
  await validateCurrentRequest(auth, {
    permissions: ['admin.users.write'],
    redirectTo: '/login',
  });
  const userId = String(formData.get('userId') ?? '');
  const node = String(formData.get('node') ?? '');
  if (!userId || !node) return;
  try {
    await getRbac().revoke(userId, node);
  } catch (e) {
    redirect(`/admin/users/${userId}?err=${encodeURIComponent(errorMessage(e))}`);
  }
  revalidatePath(`/admin/users/${userId}`);
}
