import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export default async function AdminAuditPage() {
  await validateCurrentRequest(auth, { permissions: ['admin.audit.read'] });
  const auditLog = auth.config.adapters.auditLog;
  const entries = auditLog?.list ? await auditLog.list({ limit: 100 }) : [];
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left">
            <th>When</th><th>Type</th><th>User</th><th>IP</th><th>Data</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id ?? i} className="border-b align-top">
              <td className="py-1 pr-2 whitespace-nowrap">{e.at ? new Date(e.at).toISOString() : '—'}</td>
              <td className="pr-2">{e.type}</td>
              <td className="pr-2"><code>{e.userId ?? '—'}</code></td>
              <td className="pr-2">{e.ip ?? '—'}</td>
              <td><code className="break-all">{e.data ? JSON.stringify(e.data) : ''}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
