import { NextResponse, type NextRequest } from 'next/server';
import { decodeJwt } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { clientUsers } from '@/db/schema';
import { exchangeCode, verifyIdToken } from '@/lib/oidc';
import { createSession, setSessionCookie, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'clientpg.oidc_state';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(oauthError)}`, url.origin),
    );
  }
  if (!code || !state) {
    return new NextResponse('missing code or state', { status: 400 });
  }

  const raw = req.cookies.get(STATE_COOKIE)?.value;
  if (!raw) return new NextResponse('missing state cookie', { status: 400 });
  let session: { state: string; nonce: string; codeVerifier: string };
  try {
    session = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as typeof session;
  } catch {
    return new NextResponse('bad state cookie', { status: 400 });
  }
  if (session.state !== state) return new NextResponse('state mismatch', { status: 400 });

  const tokens = await exchangeCode({ code, codeVerifier: session.codeVerifier });
  if (!tokens.id_token) return new NextResponse('missing id_token', { status: 400 });

  const claims = await verifyIdToken(tokens.id_token, { nonce: session.nonce });
  const sub = String(claims.sub ?? '');
  if (!sub) return new NextResponse('missing sub', { status: 400 });

  const email = typeof claims.email === 'string' ? claims.email : null;
  const name = typeof claims.name === 'string' ? claims.name : null;
  const image = typeof claims.picture === 'string' ? claims.picture : null;

  const existing = await db.query.clientUsers.findFirst({ where: eq(clientUsers.id, sub) });
  if (existing) {
    await db
      .update(clientUsers)
      .set({ email, name, image, lastLoginAt: new Date() })
      .where(eq(clientUsers.id, sub));
  } else {
    await db.insert(clientUsers).values({ id: sub, email, name, image });
  }

  // Refresh expiry: some IdPs expose `refresh_expires_in`; we don't, so we
  // leave it null and let the server discover expiry on refresh failure.
  const sid = await createSession({
    userId: sub,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresInSec: tokens.expires_in ?? 900,
  });

  // Peek at access token exp if available for logging.
  try {
    decodeJwt(tokens.access_token);
  } catch {
    /* not a JWT — fine */
  }

  const res = NextResponse.redirect(new URL('/', url.origin));
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sid,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set({ name: STATE_COOKIE, value: '', path: '/', maxAge: 0 });
  // side-effect: also set via cookies() helper for consistency
  void setSessionCookie;
  return res;
}
