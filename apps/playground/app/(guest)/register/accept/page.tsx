'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConsumeInvite, useInviteInfo } from '@holeauth/react';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="text-sm opacity-70">Loading invite…</div>}>
      <AcceptInviteInner />
    </Suspense>
  );
}

function AcceptInviteInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const { info, loading: infoLoading, error: infoError } = useInviteInfo(token);
  const { consume, loading, error } = useConsumeInvite();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  if (!token) {
    return (
      <main className="space-y-2">
        <h1 className="text-2xl font-semibold">Invite required</h1>
        <p className="text-sm opacity-80">No invite token provided.</p>
      </main>
    );
  }

  if (infoLoading) {
    return <main><p className="text-sm opacity-70">Loading invite…</p></main>;
  }

  if (infoError || !info) {
    return (
      <main className="space-y-2">
        <h1 className="text-2xl font-semibold">Invalid invite</h1>
        <p className="text-sm text-red-600">{infoError?.message ?? 'This invite link is not valid.'}</p>
      </main>
    );
  }

  const displayName = name || info.name || '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (password.length < 8) { setLocalErr('Password must be at least 8 characters.'); return; }
    const res = await consume({
      token: token!,
      password,
      name: displayName || undefined,
      autoSignIn: true,
    });
    if (!res.ok) {
      setLocalErr(res.error?.message ?? 'Could not accept invite');
      return;
    }
    window.location.href = '/';
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Accept invitation</h1>
      <p className="text-sm opacity-80">
        You were invited as <strong>{info.email}</strong>. Choose a password to complete your account.
      </p>
      <form className="space-y-3" onSubmit={submit}>
        <input
          type="email"
          value={info.email}
          readOnly
          className="w-full border rounded px-3 py-2 bg-gray-50"
        />
        <input
          type="text"
          placeholder="Name"
          className="w-full border rounded px-3 py-2"
          value={displayName}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password (min 8)"
          className="w-full border rounded px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Creating account…' : 'Accept & sign in'}
        </button>
        {(localErr || error) && (
          <p className="text-sm text-red-600">{localErr ?? error?.message}</p>
        )}
      </form>
      <p className="text-xs opacity-60">
        Invite expires {new Date(info.expiresAt).toLocaleString()}.
      </p>
    </main>
  );
}
