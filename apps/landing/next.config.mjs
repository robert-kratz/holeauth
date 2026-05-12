/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
  images: { unoptimized: true },
  trailingSlash: true,
  typescript: { ignoreBuildErrors: true },

  async redirects() {
    return [
      // Permanent redirect: any /docs/... path → docs.holeauth.dev/...
      // Strips the /docs prefix since the new subdomain has no basePath.
      {
        source: '/docs/:path*',
        destination: 'https://docs.holeauth.dev/:path*',
        permanent: true,
      },
      // Bare /docs → docs root
      {
        source: '/docs',
        destination: 'https://docs.holeauth.dev/',
        permanent: true,
      },
    ];
  },
};

export default config;
