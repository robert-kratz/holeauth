import Image from 'next/image';
import Link from 'next/link';
import { docsUrl } from '@/lib/docs-url';
import { HOLEAUTH_VERSION } from '@/lib/version';

const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'product',
    links: [
      { label: 'docs', href: docsUrl('/'), external: true },
      { label: 'packages', href: docsUrl('/packages'), external: true },
      { label: 'getting started', href: docsUrl('/getting-started'), external: true },
      { label: 'concepts', href: docsUrl('/concepts'), external: true },
    ],
  },
  {
    title: 'resources',
    links: [
      { label: 'github', href: 'https://github.com/robert-kratz/holeauth', external: true },
      { label: 'npm', href: 'https://www.npmjs.com/org/holeauth', external: true },
      {
        label: 'compatibility matrix',
        href: 'https://github.com/robert-kratz/holeauth/tree/main/docs/compat',
        external: true,
      },
    ],
  },
  {
    title: 'community',
    links: [
      {
        label: 'discussions',
        href: 'https://github.com/robert-kratz/holeauth/discussions',
        external: true,
      },
      {
        label: 'issues',
        href: 'https://github.com/robert-kratz/holeauth/issues',
        external: true,
      },
      {
        label: 'contact@holeauth.dev',
        href: 'mailto:contact@holeauth.dev',
        external: true,
      },
    ],
  },
  {
    title: 'legal',
    links: [
      {
        label: 'license (mit)',
        href: 'https://github.com/robert-kratz/holeauth/blob/main/LICENSE',
        external: true,
      },
      {
        label: 'security',
        href: 'https://github.com/robert-kratz/holeauth/blob/main/SECURITY.md',
        external: true,
      },
      {
        label: 'code of conduct',
        href: 'https://github.com/robert-kratz/holeauth/blob/main/CODE_OF_CONDUCT.md',
        external: true,
      },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-[var(--color-line)] bg-black/40 px-6 pt-20 pb-10 backdrop-blur-md">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-5 w-5 rounded-full"
                style={{
                  background:
                    'linear-gradient(135deg, #c1ae7c 0%, #e16f7c 25%, #dd5e98 50%, #cc4bc2 75%, #6c3a5c 100%)',
                  boxShadow: '0 0 14px rgba(204,75,194,0.40), 0 0 4px rgba(193,174,124,0.30)',
                }}
              />
              <span className="text-[15px] font-semibold tracking-tight text-ink">holeauth</span>
            </Link>
            <p className="mt-4 max-w-[200px] text-[12.5px] leading-relaxed text-muted">
              modular auth for typescript. composed from headless adapters.
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) =>
                  l.external ? (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13px] text-ink-dim transition hover:text-ink"
                      >
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[13px] text-ink-dim transition hover:text-ink"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-line)] pt-6">
          <p className="text-[12px] text-muted">© 2026 holeauth · <a href="https://holeauth.dev" className="hover:text-ink transition">holeauth.dev</a> · mit licensed (attribution required)</p>
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] text-muted">made by</span>
            <a
              href="https://rjks.us?utm_campaign=holeauth"
              target="_blank"
              rel="noreferrer"
              className="group relative flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-white/10 transition hover:ring-white/30"
              aria-label="Author – rjks.us"
            >
              <Image
                src="/rjks-logo.png"
                alt="rjks logo"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover transition duration-300 group-hover:scale-110 group-hover:brightness-110"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition duration-300 group-hover:opacity-100"
                style={{ boxShadow: '0 0 12px rgba(204,75,194,0.50)' }}
              />
            </a>
            <span className="font-mono text-[11px] text-muted">v{HOLEAUTH_VERSION}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
