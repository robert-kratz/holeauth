import type { MetadataRoute } from 'next';

const BASE = 'https://holeauth.dev';

/**
 * Sitemap for the marketing/landing host (holeauth.dev).
 *
 * The docs site lives on its own subdomain (docs.holeauth.dev) and exposes
 * its own sitemap at https://docs.holeauth.dev/sitemap.xml. Search engines
 * discover it via the docs app's robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${BASE}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];
}
