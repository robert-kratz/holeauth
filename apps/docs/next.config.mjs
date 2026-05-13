import { createMDX } from 'fumadocs-mdx/next';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let version = 'dev';
try {
  version = require('../../packages/core/package.json').version;
} catch (e) {
  console.warn('Failed to load version from packages/core/package.json, using fallback:', e.message);
}

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // The docs app is served on its own subdomain (docs.holeauth.dev).
  // No basePath: routes live at the root of the host (e.g. /, /getting-started).
  // Static assets are served from /_next/static/... on the same subdomain.
  output: 'standalone',
  // sharp is a native Node.js addon — must not be bundled by webpack.
  serverExternalPackages: ['sharp'],
  // Ensure font + branding assets are included in the standalone output trace.
  outputFileTracingIncludes: {
    '/api/og': ['./assets/fonts/**', '../../branding/logo-512.png'],
  },
  env: { NEXT_PUBLIC_HOLEAUTH_VERSION: version },
};

export default withMDX(config);
