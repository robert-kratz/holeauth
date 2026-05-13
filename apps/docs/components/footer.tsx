import Image from 'next/image';
import Link from 'next/link';
import { HOLEAUTH_VERSION } from '@/lib/version';

const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'docs',
    links: [
      { label: 'getting started', href: '/getting-started' },
      { label: 'packages', href: '/packages' },
      { label: 'concepts', href: '/concepts' },
      { label: 'guides', href: '/guides' },
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

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://holeauth.dev';

export function Footer() {
  return (
    <footer
      style={{
        position: 'relative',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0b',
        padding: '80px 24px 40px',
        colorScheme: 'dark',
      }}
    >
      <div style={{ maxWidth: 1152, margin: '0 auto' }}>
        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 40,
          }}
          className="footer-grid"
        >
          {/* Brand column */}
          <div style={{ gridColumn: 'span 2' }} className="footer-brand">
            <a
              href={LANDING_URL}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                textDecoration: 'none',
                color: '#ededed',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background:
                    'linear-gradient(135deg, #c1ae7c 0%, #e16f7c 25%, #dd5e98 50%, #cc4bc2 75%, #6c3a5c 100%)',
                  boxShadow: '0 0 14px rgba(204,75,194,0.40), 0 0 4px rgba(193,174,124,0.30)',
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                holeauth
              </span>
            </a>
            <p
              style={{
                marginTop: 16,
                maxWidth: 200,
                fontSize: 12.5,
                lineHeight: 1.65,
                color: '#6e6e78',
              }}
            >
              modular auth for typescript. composed from headless adapters.
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.22em',
                  color: '#6e6e78',
                  margin: 0,
                }}
              >
                {col.title}
              </p>
              <ul style={{ marginTop: 16, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map((l) =>
                  l.external ? (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                        rel={l.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                        style={{
                          fontSize: 13,
                          color: '#b8b8c0',
                          textDecoration: 'none',
                          transition: 'color 150ms',
                        }}
                        className="footer-link"
                      >
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        style={{
                          fontSize: 13,
                          color: '#b8b8c0',
                          textDecoration: 'none',
                          transition: 'color 150ms',
                        }}
                        className="footer-link"
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

        {/* Bottom bar */}
        <div
          style={{
            marginTop: 64,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 24,
          }}
        >
          <p style={{ fontSize: 12, color: '#6e6e78', margin: 0 }}>
            © 2026 holeauth ·{' '}
            <a
              href="https://holeauth.dev"
              style={{ color: 'inherit', textDecoration: 'none', transition: 'color 150ms' }}
              className="footer-link"
            >
              holeauth.dev
            </a>{' '}
            · mit licensed (attribution required)
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6e6e78' }}>made by</span>
            <a
              href="https://rjks.us?utm_campaign=holeauth"
              target="_blank"
              rel="noreferrer"
              aria-label="Author – rjks.us"
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '50%',
                outline: '1px solid rgba(255,255,255,0.10)',
                textDecoration: 'none',
                transition: 'outline-color 150ms',
              }}
              className="footer-avatar"
            >
              <Image
                src="/rjks-logo.png"
                alt="rjks logo"
                width={28}
                height={28}
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
              />
            </a>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 11, color: '#6e6e78' }}>
              v{HOLEAUTH_VERSION}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
