import { NextResponse, type NextRequest } from 'next/server';
import {
  buildAuthorizeUrl,
  randomUrlSafe,
  s256Challenge,
} from '@/lib/oidc';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'clientpg.oidc_state';

async function handle(_req: NextRequest) {
  const state = randomUrlSafe(16);
  const nonce = randomUrlSafe(16);
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = s256Challenge(codeVerifier);

  const url = await buildAuthorizeUrl({ state, nonce, codeChallenge });

  const payload = JSON.stringify({ state, nonce, codeVerifier });
  const res = NextResponse.redirect(url);
  res.cookies.set({
    name: STATE_COOKIE,
    value: Buffer.from(payload, 'utf8').toString('base64url'),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}

export { handle as GET, handle as POST };
