/**
 * Resolves a URL inside the landing/marketing app.
 *
 * The landing site runs on its own host (holeauth.dev in production,
 * http://localhost:3000 in dev). `NEXT_PUBLIC_LANDING_URL` must be set to
 * the absolute origin of that host.
 *
 * Production: NEXT_PUBLIC_LANDING_URL=https://holeauth.dev
 * Dev:        NEXT_PUBLIC_LANDING_URL=http://localhost:3000
 *
 * Note: always use the returned value in a plain <a> tag, never in Next.js
 * <Link>, so the browser performs a real cross-host navigation.
 */
const BASE = (process.env.NEXT_PUBLIC_LANDING_URL ?? '').replace(/\/+$/, '');

export function landingUrl(path: string = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/') return `${BASE}/`;
  return `${BASE}${path}`;
}
