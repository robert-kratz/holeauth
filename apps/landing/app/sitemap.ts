import type { MetadataRoute } from 'next';

const BASE = 'https://holeauth.dev';

/**
 * Sitemap for the entire holeauth.dev domain.
 * Landing page lives at the root; docs live under /docs (served by the
 * separate docs container via Traefik's PathPrefix rule).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // ── Landing ───────────────────────────────────────────────────────────────
  const landingRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];

  // ── Docs ─────────────────────────────────────────────────────────────────
  // Mirrors the content tree under apps/docs/content/docs/
  const docsPaths: string[] = [
    // Root
    '',
    // Getting started
    '/getting-started',
    '/getting-started/nextjs-app-router',
    '/getting-started/nextjs-pages-router',
    '/getting-started/express',
    '/getting-started/hono',
    // Concepts
    '/concepts',
    '/concepts/adapters',
    '/concepts/sessions',
    '/concepts/token-rotation',
    '/concepts/events',
    '/concepts/csrf',
    // Packages
    '/packages',
    '/packages/core',
    '/packages/adapter-drizzle',
    '/packages/nextjs-app-router',
    '/packages/nextjs-pages-router',
    '/packages/express',
    '/packages/hono',
    '/packages/react',
    '/packages/react-ui',
    '/packages/plugin-2fa',
    '/packages/plugin-passkey',
    '/packages/plugin-rbac',
    '/packages/plugin-idp',
    '/packages/plugin-idp-consumer',
    // Plugins
    '/plugins',
    '/plugins/getting-started',
    '/plugins/architecture',
    '/plugins/define-plugin',
    '/plugins/adapter',
    '/plugins/routes',
    '/plugins/hooks',
    '/plugins/api-surface',
    '/plugins/dependencies',
    '/plugins/tutorial',
    // SSO
    '/sso',
    '/sso/provider',
    '/sso/consumer',
    // Integrations
    '/integrations',
    '/integrations/trpc',
  ];

  const docsRoutes: MetadataRoute.Sitemap = docsPaths.map((path) => ({
    url: `${BASE}/docs${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 0.9 : 0.7,
  }));

  return [...landingRoutes, ...docsRoutes];
}
