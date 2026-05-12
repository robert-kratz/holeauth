import type { MetadataRoute } from 'next';

const BASE = 'https://docs.holeauth.dev';

/**
 * Sitemap for the docs host (docs.holeauth.dev).
 *
 * Mirrors the content tree under apps/docs/content/docs/. Keep this list in
 * sync when adding or moving pages. The landing host has its own sitemap at
 * https://holeauth.dev/sitemap.xml.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const paths: string[] = [
    // Root
    '/',
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

  return paths.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 0.9 : 0.7,
  }));
}
