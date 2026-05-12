import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { Github, Home } from 'lucide-react';

// The landing site lives on its own host (https://holeauth.dev in production).
// In dev it's on localhost:3000, provided via NEXT_PUBLIC_LANDING_URL in .env.local.
// Because the docs app no longer uses a basePath, ordinary Next.js <Link>s
// stay within the docs subdomain. Cross-app links must still be plain <a>
// tags so the browser performs a real navigation to the other host.
const LANDING = process.env.NEXT_PUBLIC_LANDING_URL ?? '';

/** Gradient orb + wordmark — no <a> here; Fumadocs wraps nav.title in its own Link */
const HoleauthLogo = (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      textDecoration: 'none',
      color: 'inherit',
    }}
  >
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background:
          'linear-gradient(135deg, #c1ae7c 0%, #e16f7c 25%, #dd5e98 50%, #cc4bc2 75%, #6c3a5c 100%)',
        flexShrink: 0,
      }}
    />
    <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
      holeauth
    </span>
  </span>
);

/** Shown at the bottom of the sidebar: home + GitHub links */
const SidebarFooter = (
  <div
    style={{
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '10px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}
  >
    {/* Plain <a> — basePath must not be prepended to this cross-app link */}
    <a
      href={LANDING || '/'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        fontSize: 13,
        color: '#b8b8c0',
        textDecoration: 'none',
        transition: 'background 150ms, color 150ms',
      }}
      className="sidebar-footer-link"
    >
      <Home size={14} strokeWidth={1.5} />
      Landing page
    </a>
    <a
      href="https://github.com/robert-kratz/holeauth"
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        fontSize: 13,
        color: '#b8b8c0',
        textDecoration: 'none',
        transition: 'background 150ms, color 150ms',
      }}
      className="sidebar-footer-link"
    >
      <Github size={14} strokeWidth={1.5} />
      GitHub
    </a>
  </div>
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/robert-kratz/holeauth"
      nav={{
        // nav.url tells Fumadocs where the title Link should point.
        // In dev: LANDING = 'http://localhost:3000' → links to landing app.
        // In prod: LANDING = 'https://holeauth.dev' → cross-host link back to landing.
        url: LANDING || '/',
        title: HoleauthLogo,
      }}
      // sidebar={{ footer: SidebarFooter }}
    >
      {children}
    </DocsLayout>
  );
}

