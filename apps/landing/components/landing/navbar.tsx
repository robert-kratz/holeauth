import Link from 'next/link';
import { Github, ArrowRight, Star } from 'lucide-react';
import { NavFeaturesMenu } from './nav-features-menu';
import { docsUrl } from '@/lib/docs-url';

/**
 * Best-effort GitHub star count. Returns `null` on any failure so the
 * navbar can simply omit the badge.
 *
 * Cached for 1 hour via Next's data cache. The fetch carries no auth so
 * it stays well under the unauthenticated rate limit (60 req/h/IP).
 */
async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/robert-kratz/holeauth',
      {
        next: { revalidate: 3600 },
        headers: { Accept: 'application/vnd.github+json' },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number'
      ? data.stargazers_count
      : null;
  } catch {
    return null;
  }
}

function formatStars(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1_000)}k`;
}

export async function Navbar() {
  const stars = await fetchStarCount();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[rgba(10,10,11,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
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

        {/* Center nav links */}
       <nav className="items-center gap-0.5 hidden md:flex">
            <Link href={docsUrl('/')} className="rounded-md px-3 py-1.5 text-[13px] text-ink-dim transition hover:bg-white/5 hover:text-ink">
              docs
            </Link>
            <Link href={docsUrl('/packages')} className="rounded-md px-3 py-1.5 text-[13px] text-ink-dim transition hover:bg-white/5 hover:text-ink">
              packages
            </Link>
            <NavFeaturesMenu />
            <a
              href="https://github.com/robert-kratz/holeauth"
              target="_blank"
              rel="noreferrer"
              aria-label={stars !== null ? `${stars} stars on GitHub` : 'GitHub repository'}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-ink-dim transition hover:bg-white/5 hover:text-ink"
            >
              <Github className="h-3.5 w-3.5" />
              github
              {stars !== null && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-px font-mono text-[10.5px] text-ink">
                  <Star
                    className="h-2.5 w-2.5"
                    strokeWidth={2.4}
                    style={{ color: '#fbbf24' }}
                  />
                  {formatStars(stars)}
                </span>
              )}
            </a>
          </nav>

        {/* Right CTA */}
        <Link
          href={docsUrl('/getting-started')}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium text-black transition hover:opacity-90"
          style={{
            background: '#ffffff',
          }}
        >
          get started
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
