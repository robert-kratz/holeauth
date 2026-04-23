'use client';
import { usePasskeyLogin } from '@holeauth/react';
import { useState } from 'react';

export default function PasskeyLoginPage() {
  const { login, loading, error } = usePasskeyLogin();
  const [email, setEmail] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await login(email || undefined);
    if (r.ok) window.location.href = '/';
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Sign in with passkey</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input type="email" placeholder="Email (optional)" className="w-full border rounded px-3 py-2"
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Authenticating…' : 'Sign in with passkey'}
        </button>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
      </form>
    </main>
  );
}
