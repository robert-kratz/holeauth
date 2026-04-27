'use client';
import { useState } from 'react';

type Mode = 'totp' | 'recovery';

export default function Verify2faClient() {
  const [mode, setMode] = useState<Mode>('totp');
  const [totp, setTotp] = useState('');
  const [recovery, setRecovery] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(code: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Pending challenge missing or expired → back to login.
        if (json?.error?.code === 'NO_PENDING' || res.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(json?.error?.message ?? 'Verification failed');
      }
      window.location.href = '/';
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    void verify(totp.trim());
  }

  function onRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    // Recovery codes are uppercase + dashed; normalise whitespace only.
    void verify(recovery.trim().toUpperCase());
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Two-Factor Verification</h1>

      <div
        role="tablist"
        aria-label="Verification method"
        className="flex gap-1 rounded border p-1 text-sm w-fit"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'totp'}
          onClick={() => { setMode('totp'); setErr(null); }}
          className={`rounded px-3 py-1 ${
            mode === 'totp'
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          Authenticator code
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'recovery'}
          onClick={() => { setMode('recovery'); setErr(null); }}
          className={`rounded px-3 py-1 ${
            mode === 'recovery'
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          Recovery code
        </button>
      </div>

      {mode === 'totp' ? (
        <form className="space-y-3" onSubmit={onTotpSubmit}>
          <p className="text-sm opacity-70">
            Enter the 6-digit code from your authenticator app.
          </p>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full border rounded px-3 py-2 font-mono tracking-widest"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            required
            autoFocus
          />
          <button
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={onRecoverySubmit}>
          <p className="text-sm opacity-70">
            Enter one of the recovery codes you saved when enabling 2FA. Each code works
            exactly once.
          </p>
          <input
            name="recoveryCode"
            type="text"
            autoComplete="off"
            placeholder="XXXX-XXXX-XXXX"
            className="w-full border rounded px-3 py-2 font-mono uppercase tracking-widest"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            required
            autoFocus
          />
          <button
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Verifying…' : 'Use recovery code'}
          </button>
        </form>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
    </main>
  );
}
