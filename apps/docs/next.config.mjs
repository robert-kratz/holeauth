import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.DOCS_BASE_PATH ?? '',
  trailingSlash: true,
  // Fumadocs generates a `.source/` virtual module whose inferred types reference
  // private fumadocs-mdx types. This trips Next.js' built-in type checker without
  // affecting runtime. The docs app is a static-export site; we skip its type
  // check during `next build` and rely on `pnpm typecheck` at the package level.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default withMDX(config);
