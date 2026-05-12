/**
 * Next.js middleware integration for holeauth — Pages Router edition.
 *
 * Re-exports `holeauthMiddleware` from `@holeauth/nextjs-app-router/middleware`.
 * The middleware runs on the **Edge Runtime** regardless of whether the project
 * uses App Router or Pages Router, so the implementation is shared.
 *
 * Usage in `middleware.ts` (project root):
 * ```ts
 * import { holeauthMiddleware } from '@holeauth/nextjs-pages-router/middleware';
 * import { config as authConfig } from '@/lib/auth';
 *
 * export const middleware = holeauthMiddleware({
 *   config: authConfig,
 *   protectAllExcept: ['/login', '/register', '/api/auth'],
 * });
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 * ```
 */
export {
  holeauthMiddleware,
  type MiddlewareOptions,
} from '@holeauth/nextjs-app-router/middleware';
