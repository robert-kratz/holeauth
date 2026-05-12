import clsx from 'clsx';
import { Fragment } from 'react';
import { docsUrl } from '@/lib/docs-url';

type Cell = 'yes' | 'manual' | 'no' | 'na';

const FRAMEWORKS = ['next app', 'next pages', 'express', 'hono'] as const;

interface Row {
  label: string;
  cells: [Cell, Cell, Cell, Cell];
  /** Docs path (without /docs prefix) this feature links to. */
  docsPath?: string;
}

interface Group {
  title: string;
  rows: Row[];
}

// Hand-ported from docs/compat/2026-05-11-3.md — keep in sync.
const GROUPS: Group[] = [
  {
    title: 'authentication',
    rows: [
      { label: 'email + password', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/getting-started' },
      { label: 'password reset / verify / invite', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/getting-started' },
    ],
  },
  {
    title: 'session',
    rows: [
      { label: 'jwt access + refresh rotation', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/concepts/token-rotation' },
      { label: 'server-side session', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/concepts/sessions' },
      { label: 'client useSession', cells: ['yes', 'yes', 'na', 'na'], docsPath: '/packages/react' },
    ],
  },
  {
    title: '2fa / passkeys',
    rows: [
      { label: 'totp + recovery codes', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/packages/plugin-2fa' },
      { label: 'passkey register + login', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/packages/plugin-passkey' },
    ],
  },
  {
    title: 'rbac',
    rows: [
      { label: 'roles + groups + wildcard perms', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/packages/plugin-rbac' },
      { label: 'rbac yaml config', cells: ['yes', 'yes', 'yes', 'manual'], docsPath: '/packages/rbac-yaml' },
      { label: 'client useRbac', cells: ['yes', 'yes', 'na', 'na'], docsPath: '/packages/react' },
    ],
  },
  {
    title: 'sso / idp',
    rows: [
      { label: 'oauth consumer (google / github / oidc)', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/sso/consumer' },
      { label: 'oidc provider (authz, pkce, jwks)', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/sso/provider' },
      { label: 'rp-initiated logout + revocation', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/sso/provider' },
    ],
  },
  {
    title: 'trpc',
    rows: [
      { label: 'auth context', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/integrations/trpc' },
      { label: 'transparent refresh', cells: ['yes', 'manual', 'manual', 'manual'], docsPath: '/integrations/trpc' },
      { label: 'rbac procedure guard', cells: ['yes', 'manual', 'manual', 'manual'], docsPath: '/integrations/trpc' },
    ],
  },
  {
    title: 'infrastructure',
    rows: [
      { label: 'framework middleware', cells: ['yes', 'no', 'yes', 'yes'], docsPath: '/concepts/adapters' },
      { label: 'edge runtime compatible', cells: ['yes', 'no', 'no', 'yes'], docsPath: '/concepts/adapters' },
      { label: 'audit log event system', cells: ['yes', 'yes', 'yes', 'yes'], docsPath: '/concepts/events' },
    ],
  },
];

const DRIZZLE_ADAPTERS: { pkg: string; docsPath: string }[] = [
  { pkg: '@holeauth/adapter-drizzle', docsPath: '/packages/adapter-drizzle' },
  { pkg: '@holeauth/2fa-drizzle', docsPath: '/packages/plugin-2fa' },
  { pkg: '@holeauth/passkey-drizzle', docsPath: '/packages/plugin-passkey' },
  { pkg: '@holeauth/rbac-drizzle', docsPath: '/packages/plugin-rbac' },
  { pkg: '@holeauth/idp-drizzle', docsPath: '/packages/plugin-idp' },
] as const;

function StatusCell({ value }: { value: Cell }) {
  const styles: Record<Cell, { label: string; dot: string; text: string }> = {
    yes: { label: 'first-class', dot: 'bg-[#5eead4]', text: 'text-ink' },
    manual: { label: 'manual wiring', dot: 'bg-[#fbbf24]', text: 'text-ink-dim' },
    no: { label: 'not supported', dot: 'bg-[#f87171]', text: 'text-muted' },
    na: { label: 'n/a', dot: 'bg-white/15', text: 'text-muted' },
  };
  const s = styles[value];
  return (
    <td className="px-4 py-3 align-middle">
      <span
        className={clsx('inline-flex items-center gap-2 text-[12px]', s.text)}
        title={s.label}
      >
        <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
        <span>{s.label}</span>
      </span>
    </td>
  );
}

export function CompatMatrix() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#5eead4]">
            compatibility
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">
            works where <span className="gradient-text">you build.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-ink-dim md:text-[15px]">
            four framework adapters. five drizzle adapters. one auth core. all numbers below come
            from the live monorepo —{' '}
            <a
              href="https://github.com/robert-kratz/holeauth/blob/main/docs/compat/2026-05-11-3.md"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              latest compat matrix
            </a>
            .
          </p>
        </div>

        {/* Feature × Framework */}
        <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#0c0c0f]/80 backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-white/[0.02]">
                  <th className="sticky left-0 z-10 bg-[#0c0c0f] px-4 py-3 font-medium text-muted">
                    feature
                  </th>
                  {FRAMEWORKS.map((f) => (
                    <th key={f} className="px-4 py-3 font-medium text-muted">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {GROUPS.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="bg-white/[0.015]">
                      <td
                        colSpan={5}
                        className="px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#c4b5fd]"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="hover:bg-white/[0.02]">
                        <td className="sticky left-0 z-10 bg-[#0c0c0f] px-4 py-3 text-ink">
                          {row.docsPath ? (
                            <a
                              href={docsUrl(row.docsPath)}
                              className="transition-colors hover:text-[#c4b5fd] underline decoration-dotted underline-offset-4"
                            >
                              {row.label}
                            </a>
                          ) : (
                            row.label
                          )}
                        </td>
                        {row.cells.map((c, i) => (
                          <StatusCell key={i} value={c} />
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drizzle adapter × DB */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#0c0c0f]/80 backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-white/[0.02]">
                  <th className="sticky left-0 z-10 bg-[#0c0c0f] px-4 py-3 font-medium text-muted">
                    drizzle adapter
                  </th>
                  <th className="px-4 py-3 font-medium text-muted">postgres</th>
                  <th className="px-4 py-3 font-medium text-muted">mysql</th>
                  <th className="px-4 py-3 font-medium text-muted">sqlite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {DRIZZLE_ADAPTERS.map(({ pkg, docsPath }) => (
                  <tr key={pkg} className="hover:bg-white/[0.02]">
                    <td className="sticky left-0 z-10 bg-[#0c0c0f] px-4 py-3 font-mono text-[12px] text-ink">
                      <a
                        href={docsUrl(docsPath)}
                        className="transition-colors hover:text-[#c4b5fd] underline decoration-dotted underline-offset-4"
                      >
                        {pkg}
                      </a>
                    </td>
                    <StatusCell value="yes" />
                    <StatusCell value="yes" />
                    <StatusCell value="yes" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
