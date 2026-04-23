'use client';
import { useState } from 'react';
import { useSignUp } from '@holeauth/react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const { signUp, loading } = useSignUp();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('Please enter a valid email.'); return; }
    const res = await signUp({ email, password, name: name || undefined, autoSignIn: true });
    if (!res.ok) {
      if (res.error?.code === 'REGISTRATION_DISABLED') {
        setDisabled(true);
        setErr(null);
        return;
      }
      setErr(res.error?.message ?? 'Registration failed');
      return;
    }
    window.location.href = '/';
  }

  if (disabled) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Registration disabled</h1>
        <p className="text-sm opacity-80">
          Self-registration is currently disabled on this server. Please request an
          invitation from an administrator.
        </p>
        <p className="text-sm">
          Already have an account? <a href="/login" className="underline">Sign in</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Register</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input name="name" type="text" placeholder="Name (optional)"
               className="w-full border rounded px-3 py-2"
               value={name} onChange={(e) => setName(e.target.value)} />
        <input name="email" type="email" placeholder="Email"
               className="w-full border rounded px-3 py-2"
               value={email} onChange={(e) => setEmail(e.target.value)}
               required autoComplete="email" />
        <input name="password" type="password" placeholder="Password (min 8)"
               className="w-full border rounded px-3 py-2"
               value={password} onChange={(e) => setPassword(e.target.value)}
               required minLength={8} autoComplete="new-password" />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
      <p className="text-sm opacity-70">
        Already have an account? <a href="/login" className="underline">Sign in</a>.
      </p>
    </main>
  );
}
