/**
 * Resolves a URL inside the landing/marketing app.
 *
 * Production (same domain): NEXT_PUBLIC_LANDING_URL is not set → returns a
 * plain path like / that the browser resolves on the same domain (landing).
 *
 * Dev: set NEXT_PUBLIC_LANDING_URL=http://localhost:3000 in apps/docs/.env.local
 * so cross-app links reach the landing dev server on port 3000.
 *
 * Note: always use the returned value in a plain <a> tag, never in Next.js
 * <Link>, because basePath (/docs) would otherwise be prepended.
 */
const BASE = (process.env.NEXT_PUBLIC_LANDING_URL ?? '').replace(/\/+$/, '');

export function landingUrl(path: string = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/') return `${BASE}/`;
  return `${BASE}${path}`;
}
