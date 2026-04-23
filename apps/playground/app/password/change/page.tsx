'use client';
import { useState } from 'react';
import { usePasswordChange } from '@holeauth/react';

export default function ChangePasswordPage() {
  const { change, loading, error } = usePasswordChange();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [revoke, setRevoke] = useState(true);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await change({ currentPassword: current, newPassword: next, revokeOtherSessions: revoke });
    if (r.ok) {
      setDone(true);
      setCurrent('');
      setNext('');
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Change password</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input type="password" placeholder="Current password" required
               className="w-full border rounded px-3 py-2"
               value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" placeholder="New password" required
               className="w-full border rounded px-3 py-2"
               value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
          Revoke all other sessions
        </label>
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Saving…' : 'Change password'}
        </button>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {done && <p className="text-sm text-green-600">Password updated.</p>}
      </form>
    </main>
  );
}
