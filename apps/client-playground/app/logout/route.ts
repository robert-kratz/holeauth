import { NextResponse, type NextRequest } from 'next/server';
import { destroyCurrentSession } from '@/lib/session';
import { endSessionUrl } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const { idTokenHint } = await destroyCurrentSession();
  const origin = new URL(req.url).origin;
  const postLogoutRedirectUri = `${origin}/`;
  const ids = await endSessionUrl({
    idTokenHint: idTokenHint ?? undefined,
    postLogoutRedirectUri,
  });
  const redirectTo = ids ?? postLogoutRedirectUri;
  const res = NextResponse.redirect(redirectTo);
  // cookie clearing happens inside destroyCurrentSession, but make sure it sticks on this response too
  res.cookies.set({ name: 'clientpg.sid', value: '', path: '/', maxAge: 0 });
  return res;
}

export { handle as GET, handle as POST };
