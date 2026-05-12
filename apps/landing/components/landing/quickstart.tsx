import { codeToHtml } from 'shiki';
import type { Framework } from './quickstart-tabs';
import { QuickstartTabs } from './quickstart-tabs';

// --------------------------------------------------------------------------
// Code snippets
// --------------------------------------------------------------------------

const AUTH_TS = `import { createAuth } from '@holeauth/core';
import { drizzleAdapter } from '@holeauth/adapter-drizzle/pg';
import { passkeyPlugin } from '@holeauth/plugin-passkey';
import { rbacPlugin } from '@holeauth/plugin-rbac';
import { db } from './db';

export const auth = createAuth({
  baseUrl: process.env.APP_URL!,
  secret: process.env.AUTH_SECRET!,
  adapter: drizzleAdapter({ db }),
  plugins: [passkeyPlugin(), rbacPlugin()],
});`;

const ROUTE_SNIPPETS: Record<Framework, { file: string; code: string }> = {
  'app-router': {
    file: 'app/api/auth/[...holeauth]/route.ts',
    code: `import { createAuthHandler } from '@holeauth/nextjs-app-router';
import { auth } from '@/lib/auth';

export const { GET, POST } = createAuthHandler({ auth });`,
  },
  'pages-router': {
    file: 'pages/api/auth/[...holeauth].ts',
    code: `import { createPagesAuthHandler } from '@holeauth/nextjs-pages-router';
import { auth } from '@/lib/auth';

export default createPagesAuthHandler({ auth });

export const config = {
  api: { bodyParser: false },
};`,
  },
  express: {
    file: 'server.ts',
    code: `import express from 'express';
import { createExpressAuth } from '@holeauth/express';
import { auth } from './lib/auth';

const app = express();

app.use('/api/auth', createExpressAuth({ auth }));

app.listen(3000, () => {
  console.log('listening on http://localhost:3000');
});`,
  },
  hono: {
    file: 'app.ts',
    code: `import { Hono } from 'hono';
import { createHonoAuth } from '@holeauth/hono';
import { auth } from './lib/auth';

const app = new Hono();

app.on(['GET', 'POST'], '/api/auth/*', createHonoAuth({ auth }));

export default app;`,
  },
};

async function hi(code: string): Promise<string> {
  return codeToHtml(code, {
    lang: 'typescript',
    theme: 'github-dark',
    transformers: [
      {
        root(node) {
          const pre = node.children[0] as { properties?: Record<string, unknown> };
          if (pre?.properties) pre.properties['style'] = '';
        },
      },
    ],
  });
}

// --------------------------------------------------------------------------
// Server Component (async — runs at build time in static export)
// --------------------------------------------------------------------------

export async function Quickstart() {
  const frameworks = ['app-router', 'pages-router', 'express', 'hono'] as Framework[];

  const [authTsHtml, ...routeHtmls] = await Promise.all([
    hi(AUTH_TS),
    ...frameworks.map((f) => hi(ROUTE_SNIPPETS[f].code)),
  ]);

  const routeHtml = Object.fromEntries(
    frameworks.map((f, i) => [f, routeHtmls[i]]),
  ) as Record<Framework, string>;

  const routeFile = Object.fromEntries(
    frameworks.map((f) => [f, ROUTE_SNIPPETS[f].file]),
  ) as Record<Framework, string>;

  return <QuickstartTabs authTsHtml={authTsHtml} routeHtml={routeHtml} routeFile={routeFile} />;
}
