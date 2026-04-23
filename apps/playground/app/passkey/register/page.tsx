'use client';
import { usePasskeyRegister } from '@holeauth/react';
import { useState } from 'react';

export default function PasskeyRegisterPage() {
  const { register, loading, error } = usePasskeyRegister();
  const [name, setName] = useState('My device');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await register(name);
    if (r.ok) setDone(true);
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Register a passkey</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input className="w-full border rounded px-3 py-2"
               placeholder="Device name"
               value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Registering…' : 'Register passkey'}
        </button>
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {done && <p className="text-sm text-green-600">Passkey registered.</p>}
      </form>
    </main>
  );
}
