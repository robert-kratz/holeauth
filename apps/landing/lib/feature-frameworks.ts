/**
 * Framework-aware feature variants.
 *
 * Each plugin/adapter can be installed in any of the supported runtime
 * environments. The overview page (`/features/[slug]`) shows the canonical
 * framework-agnostic flow; subpages at `/features/[slug]/[framework]` swap
 * in framework-specific install commands, route mounts and example usage.
 *
 * Data here is intentionally repetitive so each subpage is fully
 * self-contained — copy-paste lands you in a working state.
 */

import type { CodeStep } from './features-data';

export type Framework = 'app-router' | 'pages-router' | 'express' | 'hono';

export const FRAMEWORK_SLUGS: Framework[] = [
  'app-router',
  'pages-router',
  'express',
  'hono',
];

export interface FrameworkMeta {
  slug: Framework;
  label: string;
  short: string;
  /** npm package providing the framework adapter. */
  pkg: string;
  /** Path of the route handler / mount file. */
  routeFile: string;
}

export const FRAMEWORK_META: Record<Framework, FrameworkMeta> = {
  'app-router': {
    slug: 'app-router',
    label: 'Next.js App Router',
    short: 'app router',
    pkg: '@holeauth/nextjs-app-router',
    routeFile: 'app/api/auth/[...holeauth]/route.ts',
  },
  'pages-router': {
    slug: 'pages-router',
    label: 'Next.js Pages Router',
    short: 'pages router',
    pkg: '@holeauth/nextjs-pages-router',
    routeFile: 'pages/api/auth/[...holeauth].ts',
  },
  express: {
    slug: 'express',
    label: 'Express',
    short: 'express',
    pkg: '@holeauth/express',
    routeFile: 'server.ts',
  },
  hono: {
    slug: 'hono',
    label: 'Hono',
    short: 'hono',
    pkg: '@holeauth/hono',
    routeFile: 'app.ts',
  },
};

// ─── Route mount snippets (per framework) ────────────────────────────────────

const ROUTE_MOUNT: Record<Framework, { filename: string; code: string }> = {
  'app-router': {
    filename: 'app/api/auth/[...holeauth]/route.ts',
    code: `import { createAuthHandler } from '@holeauth/nextjs-app-router';
import { auth } from '@/lib/auth';

export const { GET, POST } = createAuthHandler({ auth });`,
  },
  'pages-router': {
    filename: 'pages/api/auth/[...holeauth].ts',
    code: `import { createPagesAuthHandler } from '@holeauth/nextjs-pages-router';
import { auth } from '@/lib/auth';

export default createPagesAuthHandler({ auth });

export const config = {
  api: { bodyParser: false },
};`,
  },
  express: {
    filename: 'server.ts',
    code: `import express from 'express';
import { createExpressAuth } from '@holeauth/express';
import { auth } from './lib/auth';

const app = express();
app.use('/api/auth', createExpressAuth({ auth }));

app.listen(3000, () => console.log('listening on http://localhost:3000'));`,
  },
  hono: {
    filename: 'app.ts',
    code: `import { Hono } from 'hono';
import { createHonoAuth } from '@holeauth/hono';
import { auth } from './lib/auth';

const app = new Hono();
app.on(['GET', 'POST'], '/api/auth/*', createHonoAuth({ auth }));

export default app;`,
  },
};

// ─── Per-feature usage examples (per framework) ─────────────────────────────
//
// For each plugin/adapter slug, the "usage" step shows a copy-pasteable
// example that exercises the plugin in that runtime. Steps 1-3 (install,
// schema, register) are framework-agnostic and reused.

type UsageMap = Partial<Record<string, Record<Framework, { filename: string; code: string }>>>;

const USAGE: UsageMap = {
  // ── 2FA ─────────────────────────────────────────────────────────────────
  '2fa': {
    'app-router': {
      filename: 'app/api/2fa/route.ts',
      code: `import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await auth.getSession(req);
  const { uri, secret } = await auth.plugins['2fa'].enroll(session.userId);
  return Response.json({ uri, secret });
}

export async function PUT(req: Request) {
  const { code } = await req.json();
  const session  = await auth.getSession(req);
  const ok = await auth.plugins['2fa'].verify(session.userId, code);
  return Response.json({ ok });
}`,
    },
    'pages-router': {
      filename: 'pages/api/2fa.ts',
      code: `import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await auth.getSession(req);

  if (req.method === 'POST') {
    const { uri, secret } = await auth.plugins['2fa'].enroll(session.userId);
    return res.json({ uri, secret });
  }

  if (req.method === 'PUT') {
    const ok = await auth.plugins['2fa'].verify(session.userId, req.body.code);
    return res.json({ ok });
  }

  res.status(405).end();
}`,
    },
    express: {
      filename: 'routes/2fa.ts',
      code: `import { Router } from 'express';
import { auth } from '../lib/auth';

export const twoFa = Router();

twoFa.post('/', async (req, res) => {
  const session = await auth.getSession(req);
  const { uri, secret } = await auth.plugins['2fa'].enroll(session.userId);
  res.json({ uri, secret });
});

twoFa.put('/', async (req, res) => {
  const session = await auth.getSession(req);
  const ok = await auth.plugins['2fa'].verify(session.userId, req.body.code);
  res.json({ ok });
});`,
    },
    hono: {
      filename: 'routes/2fa.ts',
      code: `import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const twoFa = new Hono();

twoFa.post('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  const { uri, secret } = await auth.plugins['2fa'].enroll(session.userId);
  return c.json({ uri, secret });
});

twoFa.put('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  const { code } = await c.req.json();
  const ok = await auth.plugins['2fa'].verify(session.userId, code);
  return c.json({ ok });
});`,
    },
  },

  // ── Passkeys ────────────────────────────────────────────────────────────
  passkeys: {
    'app-router': {
      filename: 'app/api/passkey/route.ts',
      code: `import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await auth.getSession(req);
  const options = await auth.plugins.passkey.startRegistration(session.userId);
  return Response.json(options);
}

export async function PUT(req: Request) {
  const body    = await req.json();
  const session = await auth.getSession(req);
  await auth.plugins.passkey.finishRegistration(session.userId, body);
  return Response.json({ ok: true });
}`,
    },
    'pages-router': {
      filename: 'pages/api/passkey.ts',
      code: `import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await auth.getSession(req);

  if (req.method === 'POST') {
    const options = await auth.plugins.passkey.startRegistration(session.userId);
    return res.json(options);
  }

  if (req.method === 'PUT') {
    await auth.plugins.passkey.finishRegistration(session.userId, req.body);
    return res.json({ ok: true });
  }

  res.status(405).end();
}`,
    },
    express: {
      filename: 'routes/passkey.ts',
      code: `import { Router } from 'express';
import { auth } from '../lib/auth';

export const passkey = Router();

passkey.post('/', async (req, res) => {
  const session = await auth.getSession(req);
  res.json(await auth.plugins.passkey.startRegistration(session.userId));
});

passkey.put('/', async (req, res) => {
  const session = await auth.getSession(req);
  await auth.plugins.passkey.finishRegistration(session.userId, req.body);
  res.json({ ok: true });
});`,
    },
    hono: {
      filename: 'routes/passkey.ts',
      code: `import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const passkey = new Hono();

passkey.post('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  return c.json(await auth.plugins.passkey.startRegistration(session.userId));
});

passkey.put('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  const body    = await c.req.json();
  await auth.plugins.passkey.finishRegistration(session.userId, body);
  return c.json({ ok: true });
});`,
    },
  },

  // ── RBAC ────────────────────────────────────────────────────────────────
  rbac: {
    'app-router': {
      filename: 'middleware.ts',
      code: `import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const session = await auth.getSession(req);

  const can = await auth.plugins.rbac.check(session?.userId, 'posts:write');
  if (!can) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.next();
}`,
    },
    'pages-router': {
      filename: 'pages/api/admin.ts',
      code: `import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await auth.getSession(req);
  const can = await auth.plugins.rbac.check(session?.userId, 'posts:write');
  if (!can) return res.status(403).json({ error: 'Forbidden' });

  res.json({ ok: true });
}`,
    },
    express: {
      filename: 'middleware/rbac.ts',
      code: `import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

export function requirePermission(perm: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.getSession(req);
    const can = await auth.plugins.rbac.check(session?.userId, perm);
    if (!can) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Usage:
// app.post('/posts', requirePermission('posts:write'), createPost);`,
    },
    hono: {
      filename: 'middleware/rbac.ts',
      code: `import { createMiddleware } from 'hono/factory';
import { auth } from '../lib/auth';

export const requirePermission = (perm: string) =>
  createMiddleware(async (c, next) => {
    const session = await auth.getSession(c.req.raw);
    const can = await auth.plugins.rbac.check(session?.userId, perm);
    if (!can) return c.json({ error: 'Forbidden' }, 403);
    await next();
  });

// Usage:
// app.post('/posts', requirePermission('posts:write'), handler);`,
    },
  },

  // ── SSO Provider (IDP server) ───────────────────────────────────────────
  'sso-idp': {
    'app-router': ROUTE_MOUNT['app-router'],
    'pages-router': ROUTE_MOUNT['pages-router'],
    express: ROUTE_MOUNT.express,
    hono: ROUTE_MOUNT.hono,
  },

  // ── OAuth2 Client (IDP consumer) ────────────────────────────────────────
  'oauth2-client': {
    'app-router': {
      filename: 'app/login/page.tsx',
      code: `import { auth } from '@/lib/auth';

export default async function LoginPage() {
  const googleUrl = await auth.plugins.idpConsumer.getAuthorizationUrl('google', {
    redirectTo: '/dashboard',
  });

  return (
    <a href={googleUrl} className="btn">
      Sign in with Google
    </a>
  );
}`,
    },
    'pages-router': {
      filename: 'pages/login.tsx',
      code: `import type { GetServerSideProps } from 'next';
import { auth } from '@/lib/auth';

export const getServerSideProps: GetServerSideProps = async () => {
  const googleUrl = await auth.plugins.idpConsumer.getAuthorizationUrl('google', {
    redirectTo: '/dashboard',
  });
  return { props: { googleUrl } };
};

export default function LoginPage({ googleUrl }: { googleUrl: string }) {
  return <a href={googleUrl} className="btn">Sign in with Google</a>;
}`,
    },
    express: {
      filename: 'routes/login.ts',
      code: `import { Router } from 'express';
import { auth } from '../lib/auth';

export const login = Router();

login.get('/google', async (_req, res) => {
  const url = await auth.plugins.idpConsumer.getAuthorizationUrl('google', {
    redirectTo: '/dashboard',
  });
  res.redirect(url);
});`,
    },
    hono: {
      filename: 'routes/login.ts',
      code: `import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const login = new Hono();

login.get('/google', async (c) => {
  const url = await auth.plugins.idpConsumer.getAuthorizationUrl('google', {
    redirectTo: '/dashboard',
  });
  return c.redirect(url);
});`,
    },
  },

  // ── Drizzle adapters: a "read session" example per framework ───────────
  drizzle: {
    'app-router': {
      filename: 'app/dashboard/page.tsx',
      code: `import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return <h1>Welcome, {session.user.email}</h1>;
}`,
    },
    'pages-router': {
      filename: 'pages/dashboard.tsx',
      code: `import type { GetServerSideProps } from 'next';
import { auth } from '@/lib/auth';

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const session = await auth.getSession(req);
  if (!session) return { redirect: { destination: '/login', permanent: false } };
  return { props: { email: session.user.email } };
};

export default function Dashboard({ email }: { email: string }) {
  return <h1>Welcome, {email}</h1>;
}`,
    },
    express: {
      filename: 'routes/dashboard.ts',
      code: `import { Router } from 'express';
import { auth } from '../lib/auth';

export const dashboard = Router();

dashboard.get('/', async (req, res) => {
  const session = await auth.getSession(req);
  if (!session) return res.redirect('/login');
  res.send(\`<h1>Welcome, \${session.user.email}</h1>\`);
});`,
    },
    hono: {
      filename: 'routes/dashboard.ts',
      code: `import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const dashboard = new Hono();

dashboard.get('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  if (!session) return c.redirect('/login');
  return c.html(\`<h1>Welcome, \${session.user.email}</h1>\`);
});`,
    },
  },
};

// ─── Adapter dimension (drizzle vs headless) ───────────────────────────────
//
// Plugins that need persistence (2fa, passkeys, rbac, sso-idp) can be backed
// either by the shipped `*-drizzle` adapter or by a hand-rolled headless
// adapter. The drizzle path is the canonical / default; the headless path
// replaces the schema + register steps and drops the `*-drizzle` package
// from the install command.

export type AdapterName = 'drizzle' | 'headless';

export const ADAPTER_SLUGS: AdapterName[] = ['drizzle', 'headless'];

export interface AdapterMeta {
  slug: AdapterName;
  label: string;
  short: string;
  tagline: string;
}

export const ADAPTER_META: Record<AdapterName, AdapterMeta> = {
  drizzle: {
    slug: 'drizzle',
    label: 'Drizzle',
    short: 'drizzle',
    tagline: 'Postgres · MySQL · SQLite — schema helpers included.',
  },
  headless: {
    slug: 'headless',
    label: 'Headless',
    short: 'headless',
    tagline: 'Bring your own storage — implement the adapter contract.',
  },
};

/**
 * Headless overrides — replace the schema (step 2) and register (step 3)
 * steps with hand-rolled adapter implementations.
 */
const HEADLESS_OVERRIDES: Record<
  string,
  { storage: CodeStep; register: CodeStep; drizzlePackages: string[] }
> = {
  '2fa': {
    drizzlePackages: ['@holeauth/2fa-drizzle'],
    storage: {
      step: 2,
      title: 'Implement the 2FA adapter',
      description:
        'The plugin only needs a tiny CRUD surface — back it with any storage. Here is a minimal in-memory implementation.',
      filename: 'lib/2fa-adapter.ts',
      language: 'typescript',
      code: `import type { TwoFactorAdapter } from '@holeauth/plugin-2fa';

const secrets = new Map<string, { secret: string; verifiedAt: Date | null }>();

export const memoryTotpAdapter: TwoFactorAdapter = {
  async getSecret(userId)          { return secrets.get(userId) ?? null; },
  async setSecret(userId, secret)  { secrets.set(userId, { secret, verifiedAt: null }); },
  async markVerified(userId)       {
    const row = secrets.get(userId);
    if (row) row.verifiedAt = new Date();
  },
  async deleteSecret(userId)       { secrets.delete(userId); },
};`,
    },
    register: {
      step: 3,
      title: 'Register the plugin',
      description:
        'Pass your headless adapter — no Drizzle, no schema imports.',
      filename: 'lib/auth.ts',
      language: 'typescript',
      code: `import { createAuth } from '@holeauth/core';
import { plugin2fa } from '@holeauth/plugin-2fa';
import { memoryTotpAdapter } from './2fa-adapter';

export const auth = createAuth({
  // ... core config
  plugins: [
    plugin2fa({
      adapter: memoryTotpAdapter,
      issuer:  'My App',
    }),
  ],
});`,
    },
  },

  passkeys: {
    drizzlePackages: ['@holeauth/passkey-drizzle'],
    storage: {
      step: 2,
      title: 'Implement the passkey adapter',
      description:
        'Persist credentials wherever you like. The contract is a handful of CRUD calls.',
      filename: 'lib/passkey-adapter.ts',
      language: 'typescript',
      code: `import type { PasskeyAdapter, PasskeyCredential } from '@holeauth/plugin-passkey';

const byId   = new Map<string, PasskeyCredential>();
const byUser = new Map<string, Set<string>>();

export const memoryPasskeyAdapter: PasskeyAdapter = {
  async createCredential(c) {
    byId.set(c.credentialId, c);
    if (!byUser.has(c.userId)) byUser.set(c.userId, new Set());
    byUser.get(c.userId)!.add(c.credentialId);
    return c;
  },
  async getCredentialById(id)    { return byId.get(id) ?? null; },
  async listForUser(userId)      {
    const ids = byUser.get(userId) ?? new Set();
    return [...ids].map((id) => byId.get(id)!).filter(Boolean);
  },
  async updateCounter(id, counter) {
    const c = byId.get(id);
    if (c) byId.set(id, { ...c, counter });
  },
  async deleteCredential(id)     { byId.delete(id); },
};`,
    },
    register: {
      step: 3,
      title: 'Register the plugin',
      description:
        'Wire your custom passkey adapter into the auth instance.',
      filename: 'lib/auth.ts',
      language: 'typescript',
      code: `import { createAuth } from '@holeauth/core';
import { pluginPasskey } from '@holeauth/plugin-passkey';
import { memoryPasskeyAdapter } from './passkey-adapter';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginPasskey({
      adapter: memoryPasskeyAdapter,
      rpId:    'example.com',
      rpName:  'My App',
      origin:  'https://example.com',
    }),
  ],
});`,
    },
  },

  rbac: {
    drizzlePackages: ['@holeauth/rbac-drizzle'],
    storage: {
      step: 2,
      title: 'Define roles in YAML',
      description:
        'YAML stays the same — only the user-to-role assignment storage changes.',
      filename: 'holeauth.rbac.yml',
      language: 'yaml',
      code: `roles:
  admin:
    permissions:
      - '*'
  editor:
    permissions:
      - posts:read
      - posts:write
      - posts:delete
  viewer:
    permissions:
      - posts:read`,
    },
    register: {
      step: 3,
      title: 'Implement assignments + register',
      description:
        'Map users to roles however you like — env var, Redis, JSON file, your own DB.',
      filename: 'lib/auth.ts',
      language: 'typescript',
      code: `import { createAuth } from '@holeauth/core';
import { pluginRbac } from '@holeauth/plugin-rbac';
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import type { RbacAdapter } from '@holeauth/plugin-rbac';

// Headless adapter — back it with anything (Redis, JSON, REST, etc.)
const assignments = new Map<string, Set<string>>([
  ['user-1', new Set(['admin'])],
  ['user-2', new Set(['editor'])],
]);

const memoryRbacAdapter: RbacAdapter = {
  async getUserRoles(userId)         { return [...(assignments.get(userId) ?? [])]; },
  async assignRole(userId, role)     {
    if (!assignments.has(userId)) assignments.set(userId, new Set());
    assignments.get(userId)!.add(role);
  },
  async revokeRole(userId, role)     { assignments.get(userId)?.delete(role); },
  async listMembers(role)            {
    return [...assignments.entries()]
      .filter(([, roles]) => roles.has(role))
      .map(([uid]) => uid);
  },
};

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginRbac({
      adapter:  memoryRbacAdapter,
      config:   await loadRbacYaml('./holeauth.rbac.yml'),
      cacheTtl: 30_000,
    }),
  ],
});`,
    },
  },

  'sso-idp': {
    drizzlePackages: ['@holeauth/idp-drizzle'],
    storage: {
      step: 2,
      title: 'Implement the IDP adapter',
      description:
        'OAuth clients, tokens, and grants live in your own storage — implement the contract directly.',
      filename: 'lib/idp-adapter.ts',
      language: 'typescript',
      code: `import type { IdpAdapter, OAuthClient, OAuthToken, OAuthGrant } from '@holeauth/plugin-idp';

const clients = new Map<string, OAuthClient>();
const tokens  = new Map<string, OAuthToken>();
const grants  = new Map<string, OAuthGrant>();

export const memoryIdpAdapter: IdpAdapter = {
  // Clients
  async createClient(c)        { clients.set(c.id, c); return c; },
  async getClientById(id)      { return clients.get(id) ?? null; },
  async listClients()          { return [...clients.values()]; },

  // Tokens
  async createToken(t)         { tokens.set(t.id, t); return t; },
  async getTokenByHash(hash)   {
    return [...tokens.values()].find((t) => t.hash === hash) ?? null;
  },
  async revokeToken(id)        { tokens.delete(id); },
  async revokeFamily(familyId) {
    for (const [id, t] of tokens) if (t.familyId === familyId) tokens.delete(id);
  },

  // Authorization grants
  async createGrant(g)         { grants.set(g.code, g); return g; },
  async consumeGrant(code)     {
    const g = grants.get(code);
    if (g) grants.delete(code);
    return g ?? null;
  },
};`,
    },
    register: {
      step: 3,
      title: 'Register the plugin',
      description:
        'Plug in your headless IDP adapter — issuer, lifetimes, and signing keys are unchanged.',
      filename: 'lib/auth.ts',
      language: 'typescript',
      code: `import { createAuth } from '@holeauth/core';
import { pluginIdp } from '@holeauth/plugin-idp';
import { memoryIdpAdapter } from './idp-adapter';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginIdp({
      adapter:         memoryIdpAdapter,
      issuer:          'https://auth.example.com',
      accessTokenTtl:  900,    // 15 min
      refreshTokenTtl: 86_400, // 24 h
    }),
  ],
});`,
    },
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Whether a feature slug supports per-framework subpages.
 */
export function hasFrameworkVariant(slug: string): boolean {
  return slug in USAGE;
}

/**
 * Whether a feature slug supports the drizzle ↔ headless adapter axis.
 * Only persistence-backed plugins qualify.
 */
export function hasAdapterVariant(slug: string): boolean {
  return slug in HEADLESS_OVERRIDES;
}

/**
 * Build the framework-specific package list for a feature.
 * Adds the framework adapter package to the canonical plugin packages.
 */
export function packagesForFramework(
  basePackages: string[],
  framework: Framework,
): string[] {
  const adapter = FRAMEWORK_META[framework].pkg;
  return basePackages.includes(adapter) ? basePackages : [adapter, ...basePackages];
}

/**
 * Combined package list for a (framework, adapter) variant. When `adapter`
 * is `headless`, the plugin's `*-drizzle` companion packages are removed.
 */
export function packagesForVariant(
  basePackages: string[],
  slug: string,
  framework: Framework,
  adapter: AdapterName,
): string[] {
  let pkgs = packagesForFramework(basePackages, framework);
  if (adapter === 'headless') {
    const drop = HEADLESS_OVERRIDES[slug]?.drizzlePackages ?? [];
    pkgs = pkgs.filter((p) => !drop.includes(p));
  }
  return pkgs;
}

/**
 * Re-write a feature's steps for a (framework, adapter?) combination.
 *
 * - Step 1 (install) — package list adapts to framework + adapter
 * - Steps 2-3        — replaced with headless storage + register on `adapter='headless'`
 * - Final step       — framework-specific usage example
 */
export function stepsForFramework(
  baseSteps: CodeStep[],
  basePackages: string[],
  slug: string,
  framework: Framework,
  adapter: AdapterName = 'drizzle',
): CodeStep[] {
  const usage = USAGE[slug]?.[framework];
  if (!usage) return baseSteps;

  const pkgList = packagesForVariant(basePackages, slug, framework, adapter);
  const overrides = adapter === 'headless' ? HEADLESS_OVERRIDES[slug] : null;

  const next: CodeStep[] = baseSteps.map((s, idx) => {
    // Replace step 1 with the variant install command.
    if (idx === 0 && s.language === 'bash' && /^(pnpm add|npm install|bun add)\s+/.test(s.code.trim())) {
      const verb = s.code.trim().match(/^(pnpm add|npm install|bun add)/)?.[0] ?? 'pnpm add';
      return {
        ...s,
        description:
          adapter === 'headless'
            ? `Install the plugin and the ${FRAMEWORK_META[framework].label} adapter — no Drizzle.`
            : `Install the plugin alongside the ${FRAMEWORK_META[framework].label} adapter.`,
        code: `${verb} ${pkgList.join(' ')}`,
      };
    }

    // Headless: swap storage + register steps in place.
    if (overrides) {
      if (idx === 1) return { ...overrides.storage, step: s.step };
      if (idx === 2) return { ...overrides.register, step: s.step };
    }

    return s;
  });

  // Replace the LAST step with the framework-specific usage.
  if (next.length > 0) {
    const last = next[next.length - 1]!;
    next[next.length - 1] = {
      ...last,
      title: usageStepTitle(slug),
      description: usageStepDescription(slug, framework),
      filename: usage.filename,
      language: 'typescript',
      code: usage.code,
    };
  }

  return next;
}

function usageStepTitle(slug: string): string {
  switch (slug) {
    case '2fa':
      return 'Enroll & verify';
    case 'passkeys':
      return 'Register & authenticate';
    case 'rbac':
      return 'Enforce permissions';
    case 'sso-idp':
      return 'Mount the OIDC endpoints';
    case 'oauth2-client':
      return 'Trigger sign-in';
    case 'drizzle':
      return 'Read the session';
    default:
      return 'Use it';
  }
}

function usageStepDescription(slug: string, framework: Framework): string {
  const fw = FRAMEWORK_META[framework].label;
  switch (slug) {
    case '2fa':
      return `Wire up TOTP enrollment and verification in ${fw}.`;
    case 'passkeys':
      return `Kick off the WebAuthn ceremonies from ${fw}.`;
    case 'rbac':
      return `Gate routes and handlers in ${fw} by checking permissions.`;
    case 'sso-idp':
      return `Mount the auth handler — OIDC endpoints register automatically on ${fw}.`;
    case 'oauth2-client':
      return `Redirect the user into the provider's authorization flow from ${fw}.`;
    case 'drizzle':
      return `Read the active session anywhere in ${fw}.`;
    default:
      return `Use the plugin in ${fw}.`;
  }
}
