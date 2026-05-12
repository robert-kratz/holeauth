/**
 * Resolves a URL inside the docs (Fumadocs) app.
 *
 * Production (same domain): NEXT_PUBLIC_DOCS_URL is not set → returns plain
 * path like /docs/getting-started that Traefik routes to the docs container.
 *
 * Dev: set NEXT_PUBLIC_DOCS_URL=http://localhost:3001 in apps/landing/.env.local
 * so cross-app links reach the docs dev server on port 3001.
 */
const BASE = (process.env.NEXT_PUBLIC_DOCS_URL ?? '').replace(/\/+$/, '');

export function docsUrl(path: string = '/'): string {
  if (!path.startsWith('/')) path = `/${path}`;
  // The docs app sits under /docs (fumadocs baseUrl + basePath).
  if (path === '/') return `${BASE}/docs`;
  return `${BASE}/docs${path}`;
}
