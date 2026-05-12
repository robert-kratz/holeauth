/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
  images: { unoptimized: true },
  trailingSlash: true,
  // The landing app inherits the same lax type-checking posture as the docs
  // app (which used to host this code). Type errors are still surfaced by
  // `pnpm typecheck` and IDE diagnostics; we just don't block production
  // builds on them.
  typescript: { ignoreBuildErrors: true },
};

export default config;
