/**
 * Resolves a URL inside the docs (Fumadocs) app.
 *
 * The docs app runs on its own subdomain (docs.holeauth.dev in production,
 * http://localhost:3001 in dev). `NEXT_PUBLIC_DOCS_URL` is baked in at
 * build time; falls back to the production subdomain so links always work
 * even if the build arg is accidentally omitted.
 *
 * Production: NEXT_PUBLIC_DOCS_URL=https://docs.holeauth.dev
 * Dev:        NEXT_PUBLIC_DOCS_URL=http://localhost:3001  (via .env.local)
 */
const BASE = (
  process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.holeauth.dev'
).replace(/\/+$/, '');

export function docsUrl(path: string = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/') return `${BASE}/`;
  return `${BASE}${path}`;
}
