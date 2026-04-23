'use client';
import { useEffect, useState } from 'react';
import { downloadRecoveryCodesAsTxt } from '@holeauth/plugin-2fa';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)'),
  );
  return m ? decodeURIComponent(m[1]!) : null;
}

type Stage = 'idle' | 'pending-activate' | 'done' | 'enabled' | 'disabling';

interface SetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export function TwoFactorSetupClient({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [stage, setStage] = useState<Stage>(initiallyEnabled ? 'enabled' : 'idle');
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function csrfFetch(url: string, body?: unknown) {
    const csrf = getCookie('holeauth.csrf');
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  }

  async function begin() {
    setBusy(true);
    setErr(null);
    try {
      const res = await csrfFetch('/api/auth/2fa/setup');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Setup failed');
      setSetup({
        secret: json.secret,
        otpauthUrl: json.otpauthUrl,
        qrCodeDataUrl: json.qrCodeDataUrl,
      });
      setStage('pending-activate');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await csrfFetch('/api/auth/2fa/activate', { code });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Activation failed');
      setCodes(json.recoveryCodes ?? []);
      setStage('done');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await csrfFetch('/api/auth/2fa/disable', { code: disableCode });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? 'Disable failed');
      setDisableCode('');
      setStage('idle');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCodes() {
    downloadRecoveryCodesAsTxt(codes, {
      fileName: 'holeauth-recovery-codes.txt',
      issuer: 'Holeauth Playground',
    });
  }

  useEffect(() => {
    if (!getCookie('holeauth.csrf')) fetch('/api/auth/csrf').catch(() => {});
  }, []);

  if (stage === 'enabled') {
    return (
      <section className="space-y-4">
        <p className="text-sm opacity-80">
          Two-factor authentication is currently active. Enter a current 6-digit code from
          your authenticator app to disable it.
        </p>
        <form onSubmit={disable} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            className="w-full border rounded px-3 py-2 font-mono tracking-widest"
            placeholder="123456"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            required
          />
          <button
            className="rounded border px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </form>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {stage === 'idle' && (
        <button
          onClick={begin}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Begin 2FA Setup'}
        </button>
      )}
      {stage === 'pending-activate' && setup && (
        <form onSubmit={activate} className="space-y-3">
          <p className="text-sm opacity-80">
            Scan the QR code below with your authenticator app (or copy the secret manually),
            then enter the 6-digit code to activate.
          </p>
          {setup.qrCodeDataUrl && (
            <img
              src={setup.qrCodeDataUrl}
              alt="2FA QR code"
              width={224}
              height={224}
              className="rounded border bg-white p-2"
            />
          )}
          <details className="text-xs opacity-70">
            <summary className="cursor-pointer">Show otpauth URL</summary>
            <code className="mt-2 block break-all rounded bg-gray-100 p-2 dark:bg-gray-900">
              {setup.otpauthUrl}
            </code>
          </details>
          <p className="text-xs opacity-60">
            Secret: <span className="font-mono">{setup.secret}</span>
          </p>
          <input
            type="text"
            inputMode="numeric"
            className="w-full border rounded px-3 py-2 font-mono tracking-widest"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Activating…' : 'Activate'}
          </button>
        </form>
      )}
      {stage === 'done' && (
        <div className="space-y-3">
          <p className="text-green-700 dark:text-green-300">
            2FA activated. Save these recovery codes — each works exactly once.
          </p>
          <ul className="rounded border p-3 font-mono text-sm space-y-0.5">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadCodes}
              className="rounded border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Download as .txt
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
