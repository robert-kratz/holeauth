import Link from 'next/link';
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export default async function ProfilePage() {
  const { session, user } = await validateCurrentRequest(auth, { loadUser: true });
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <dt className="opacity-70">User ID</dt><dd className="col-span-2"><code>{session.userId}</code></dd>
        <dt className="opacity-70">Email</dt><dd className="col-span-2">{user?.email}</dd>
        <dt className="opacity-70">Name</dt><dd className="col-span-2">{user?.name ?? '—'}</dd>
        <dt className="opacity-70">Session ID</dt><dd className="col-span-2"><code>{session.sessionId}</code></dd>
      </dl>
      <ul className="list-disc pl-6">
        <li><Link href="/password/change">Change password</Link></li>
        <li><Link href="/2fa/setup">Enable 2FA</Link></li>
        <li><Link href="/passkey/register">Register passkey</Link></li>
      </ul>
    </main>
  );
}
