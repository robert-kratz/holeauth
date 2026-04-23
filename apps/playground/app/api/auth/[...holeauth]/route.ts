import { auth } from '@/lib/auth';

// argon2 (optional dep) is Node-only; use the edge runtime in your own app
// only if you stick to the scrypt fallback and avoid native deps.
export const runtime = 'nodejs';

export function GET(req: Request): Promise<Response> {
  return auth.handlers.GET(req);
}

export function POST(req: Request): Promise<Response> {
  return auth.handlers.POST(req);
}
