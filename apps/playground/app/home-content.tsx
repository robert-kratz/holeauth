'use client';
import Link from 'next/link';
import { useAuthenticated, useSignOut } from '@holeauth/react';

interface PlaygroundUser {
  email?: string | null;
  name?: string | null;
}

export function HomeContent() {
  const { session, user } = useAuthenticated<PlaygroundUser>();
  const { signOut, loading } = useSignOut();

  async function handleSignOut() {
    const res = await signOut();
    if (res.ok) {
      // Hard navigation so the now-cleared cookies are sent on the next request.
      window.location.href = '/login';
    }
  }

  return (
    <div className="space-y-3">
      <p>
        Signed in as <code>{user?.email ?? session.userId}</code>.
      </p>
      <button
        className="rounded border px-3 py-1 disabled:opacity-50"
        disabled={loading}
        onClick={() => void handleSignOut()}
      >
        {loading ? 'Signing out…' : 'Sign out'}
      </button>
      <ul className="list-disc pl-6">
        <li><Link href="/profile">Profile →</Link></li>
        <li><Link href="/account/sessions">Active sessions →</Link></li>
        <li><Link href="/2fa/setup">2FA setup →</Link></li>
        <li><Link href="/passkey">My passkeys →</Link></li>
        <li><Link href="/passkey/register">Register a passkey →</Link></li>
        <li><Link href="/password/change">Change password →</Link></li>
        <li><Link href="/developer/apps">OAuth apps (developer) →</Link></li>
        <li><Link href="/admin">Admin →</Link></li>
      </ul>
    </div>
  );
}
