'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get('returnTo') ?? '/';
  // Only allow same-origin relative paths
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Sign in failed');
      const suffix = returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
      if (json.pending && json.pluginId === 'twofa') window.location.href = `/2fa/verify${suffix}`;
      else if (json.pending) window.location.href = `/2fa/verify${suffix ? suffix + '&' : '?'}plugin=${encodeURIComponent(json.pluginId)}`;
      else window.location.href = returnTo;
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input name="email" type="email" placeholder="Email" className="w-full border rounded px-3 py-2"
               value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input name="password" type="password" placeholder="Password" className="w-full border rounded px-3 py-2"
               value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
      <div className="space-y-2">
        <p className="text-sm opacity-70">Or continue with:</p>
        <div className="flex gap-2">
          <a className="rounded border px-3 py-1" href="/api/auth/authorize/google">Google</a>
          <a className="rounded border px-3 py-1" href="/api/auth/authorize/github">GitHub</a>
          <a className="rounded border px-3 py-1" href="/passkey/login">Passkey</a>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="space-y-6"><h1 className="text-2xl font-semibold">Login</h1></main>}>
      <LoginForm />
    </Suspense>
  );
}
