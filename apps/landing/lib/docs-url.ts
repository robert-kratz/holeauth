/**
 * Resolves a URL inside the docs (Fumadocs) app.
 *
 * The docs app runs on its own subdomain (docs.holeauth.dev in production,
 * http://localhost:3001 in dev). `NEXT_PUBLIC_DOCS_URL` must be set to the
 * absolute origin of that host — there is no longer a `/docs` subpath.
 *
 * Production: NEXT_PUBLIC_DOCS_URL=https://docs.holeauth.dev
 * Dev:        NEXT_PUBLIC_DOCS_URL=http://localhost:3001
 */
const BASE = (process.env.NEXT_PUBLIC_DOCS_URL ?? '').replace(/\/+$/, '');

export function docsUrl(path: string = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/') return `${BASE}/`;
  return `${BASE}${path}`;
}
