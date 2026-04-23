import Link from 'next/link';
import { Suspense } from 'react';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { getRbac } from '@/lib/rbac';
import { Skeleton } from '@/app/skeleton';

export default function RbacPage() {
  return (
    <main className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">RBAC — Groups & Permissions</h1>
        <Link href="/admin" className="text-sm underline opacity-70">← Admin</Link>
      </div>
      <p className="text-sm opacity-70">
        Defined in <code>holeauth.rbac.yml</code>. Each group lists its <em>own</em>{' '}
        permissions and the full <em>effective</em> set after inheritance is resolved.
      </p>
      <Suspense fallback={<RbacSkeleton />}>
        <RbacBoundary />
      </Suspense>
    </main>
  );
}

function RbacSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded border p-4 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

async function RbacBoundary() {
  await validateCurrentRequest(auth, {
    permissions: ['admin.read'],
    redirectTo: '/login',
  });

  const rbac = getRbac();
  const { groups, defaultGroupId } = rbac.snapshot();

  // Aggregate every effective permission node across all groups.
  const allNodes = new Set<string>();
  for (const g of groups) for (const node of g.effective) allNodes.add(node);
  const sortedNodes = [...allNodes].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Groups</h2>
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded border p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-sm">{g.id}</span>
                  {g.id === defaultGroupId && (
                    <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      default
                    </span>
                  )}
                  {g.displayName && (
                    <span className="ml-2 text-sm opacity-80">{g.displayName}</span>
                  )}
                </div>
                <span className="text-xs opacity-60">priority: {g.priority ?? 0}</span>
              </div>
              {g.description && <p className="text-sm opacity-70">{g.description}</p>}

              {g.permissions && g.permissions.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-60">Own</p>
                  <PermList nodes={g.permissions} />
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide opacity-60">Effective</p>
                <PermList nodes={g.effective} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All permission nodes</h2>
        <p className="text-xs opacity-60">
          Union of every effective permission across all groups ({sortedNodes.length}).
        </p>
        <PermList nodes={sortedNodes} />
      </section>
    </div>
  );
}

function PermList({ nodes }: { nodes: string[] }) {
  if (nodes.length === 0) {
    return <p className="text-xs italic opacity-60">— none —</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1">
      {nodes.map((n) => {
        const negated = n.startsWith('!');
        return (
          <li
            key={n}
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
  );
}
