import { holeauthMiddleware } from '@holeauth/nextjs/middleware';

// Playground uses a dev secret; real apps should read from env.
export default holeauthMiddleware({
  config: {
    secrets: { jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me' },
    // The middleware only validates tokens; adapters are not required here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapters: {} as any,
    tokens: { cookiePrefix: 'holeauth' },
  },
  // Secure-by-default: every page requires a session except the public ones
  // listed below. Auth API routes must stay public so login/refresh work.
  protectAllExcept: [
    '/login',
    '/register',
    '/logout',
    '/password/forgot',
    '/password/reset',
    '/passkey/login',
    '/sso',
    '/2fa/verify',
    '/api/auth',
    // tRPC handles its own auth + transparent refresh in createTrpcContext —
    // letting the Next middleware redirect would hide the 401 from clients and
    // skip the getSessionOrRefresh rotation flow.
    '/api/trpc',
    '/_next',
    '/favicon.ico',
  ],
  signInPath: '/login',
});

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
