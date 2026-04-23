'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePasswordReset } from '@holeauth/react';

export default function ForgotPasswordPage() {
  const { request, loading, error } = usePasswordReset();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await request(email);
    if (r.ok) setDone(true);
  }

  if (done) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p>If an account exists for {email}, a reset link has been sent.</p>
        <Link className="text-sm underline" href="/login">Back to login</Link>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Forgot password</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input type="email" placeholder="Email" required
               className="w-full border rounded px-3 py-2"
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
      </form>
    </main>
  );
}
