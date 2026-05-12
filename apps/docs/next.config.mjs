import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // The docs app is served on its own subdomain (docs.holeauth.dev).
  // No basePath: routes live at the root of the host (e.g. /, /getting-started).
  // Static assets are served from /_next/static/... on the same subdomain.
  output: 'standalone',
};

export default withMDX(config);
