import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // All routes in this app are served under /docs on the shared domain.
  // Traefik's PathPrefix(/docs) rule routes both pages (/docs/...) and
  // static assets (/docs/_next/static/...) to this container cleanly.
  basePath: '/docs',
  output: 'standalone',
};

export default withMDX(config);
