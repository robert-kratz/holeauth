import type { NextRequest } from 'next/server';
import { renderOgImage } from '@/lib/og-image';

// Must run on the Node.js runtime — sharp is a native addon, incompatible with Edge.
export const runtime = 'nodejs';

// Do not statically prerender this route; the cache lives in process memory.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// In-process image cache — persists for the lifetime of the server process.
// Cleared only on hard restart (server reboot / redeploy), as requested.
// ---------------------------------------------------------------------------
const cache = new Map<string, Buffer>();

// Strip HTML/XML tags and trim; used to sanitise query-string inputs.
function sanitise(raw: string, maxLen: number): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLen);
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = req.nextUrl;

  const rawTitle = searchParams.get('title');
  if (!rawTitle) {
    return new Response('Missing required query parameter: title', { status: 400 });
  }

  const title = sanitise(rawTitle, 120);
  if (!title) {
    return new Response('title must not be empty after sanitisation', { status: 400 });
  }

  const rawDesc = searchParams.get('description');
  const description = rawDesc ? sanitise(rawDesc, 160) : undefined;

  const cacheKey = `${title}|${description ?? ''}`;

  let png = cache.get(cacheKey);
  if (!png) {
    png = await renderOgImage(title, description);
    cache.set(cacheKey, png);
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Cache aggressively in browsers and CDNs.
      // The URL encodes all inputs, so a new title always busts the URL.
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  });
}
