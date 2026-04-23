/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // @node-rs/argon2 ships native .node binaries; keep it out of webpack's graph.
  serverExternalPackages: ['@node-rs/argon2'],
};
export default config;
