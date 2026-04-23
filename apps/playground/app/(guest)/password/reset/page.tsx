'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePasswordReset } from '@holeauth/react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const initialToken = params?.get('token') ?? '';
  const initialEmail = params?.get('email') ?? '';

  const { consume, loading, error } = usePasswordReset();
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await consume({ email, token, newPassword: password });
    if (r.ok) setDone(true);
  }

  if (done) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Password reset</h1>
        <p>You can now <Link className="underline" href="/login">sign in</Link>.</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input type="email" placeholder="Email" required className="w-full border rounded px-3 py-2"
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="text" placeholder="Reset token" required className="w-full border rounded px-3 py-2"
               value={token} onChange={(e) => setToken(e.target.value)} />
        <input type="password" placeholder="New password" required className="w-full border rounded px-3 py-2"
               value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Saving…' : 'Reset password'}
        </button>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
      </form>
    </main>
  );
}
