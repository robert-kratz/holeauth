import Link from 'next/link';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export default async function AdminPage() {
  const { session } = await validateCurrentRequest(auth, {
    permissions: ['admin.read'],
    redirectTo: '/login',
  });
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm opacity-70">Admin user: <code>{session.userId}</code></p>
      <ul className="list-disc pl-6">
        <li><Link href="/admin/users">Users</Link></li>
        <li><Link href="/admin/sessions">Sessions</Link></li>
        <li><Link href="/admin/rbac">RBAC — groups & permissions</Link></li>
        <li><Link href="/admin/idp">IdP — apps & signing keys</Link></li>
        <li><Link href="/admin/audit">Audit log</Link></li>
      </ul>
    </main>
  );
}
