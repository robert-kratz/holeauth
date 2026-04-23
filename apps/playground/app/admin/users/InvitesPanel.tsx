'use client';
import { useState } from 'react';
import { useRevokeInvite } from '@holeauth/react';

export interface InviteRow {
  identifier: string;
  email: string;
  expiresAt: number;
}

export function InvitesPanel({ invites }: { invites: InviteRow[] }) {
  const [rows, setRows] = useState<InviteRow[]>(invites);
  const { revoke, loading } = useRevokeInvite();

  async function onRevoke(identifier: string) {
    const res = await revoke(identifier);
    if (res.ok) setRows((r) => r.filter((x) => x.identifier !== identifier));
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Open invites</h2>
      {rows.length === 0 ? (
        <p className="text-sm opacity-70">No open invites.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Email</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.identifier} className="border-b">
                <td className="py-2">{i.email}</td>
                <td>{new Date(i.expiresAt).toLocaleString()}</td>
                <td className="text-right">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onRevoke(i.identifier)}
                    className="text-xs underline opacity-80 hover:opacity-100 disabled:opacity-40"
                  >
                    revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
