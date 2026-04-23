'use client';
import { useState } from 'react';
import { useCreateInvite } from '@holeauth/react';

export interface GroupOption {
  id: string;
  displayName: string;
  isDefault: boolean;
}

export function InviteForm({ groups }: { groups: GroupOption[] }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [ttlDays, setTtlDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { createInvite, loading, error, result, reset } = useCreateInvite();

  function toggleGroup(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createInvite({
      email,
      name: name || undefined,
      groupIds: Array.from(selected),
      ttlSeconds: ttlDays * 24 * 60 * 60,
    });
  }

  if (result) {
    return (
      <div className="space-y-4 rounded border border-green-200 bg-green-50 p-4">
        <h2 className="text-lg font-medium">Invite created</h2>
        <p className="text-sm">
          Copy this link and send it to the invitee. It expires{' '}
          <strong>{new Date(result.expiresAt).toLocaleString()}</strong>.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={result.url ?? result.token}
            className="flex-1 border rounded px-3 py-2 bg-white font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="rounded bg-black px-3 py-2 text-white text-sm"
            onClick={() => {
              void navigator.clipboard.writeText(result.url ?? result.token);
            }}
          >
            Copy
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => {
              setEmail(''); setName(''); setSelected(new Set()); reset();
            }}
          >
            Create another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Name (optional, pre-fill)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Groups</label>
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => toggleGroup(g.id)}
              />
              <span>
                {g.displayName}{' '}
                {g.isDefault && <span className="text-xs opacity-60">(default)</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs opacity-60 mt-1">
          Default group is always assigned at registration; pick additional groups here.
        </p>
      </div>
      <div>
        <label className="block text-sm mb-1">Expires in (days)</label>
        <input
          type="number"
          min={1}
          max={90}
          value={ttlDays}
          onChange={(e) => setTtlDays(Math.max(1, Number(e.target.value) || 1))}
          className="w-32 border rounded px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create invite link'}
      </button>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
    </form>
  );
}
