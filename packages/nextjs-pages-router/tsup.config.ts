import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/middleware.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'next',
    '@holeauth/core',
    '@holeauth/core/session',
    '@holeauth/core/cookies',
    '@holeauth/core/errors',
    '@holeauth/nextjs-app-router',
    '@holeauth/nextjs-app-router/middleware',
  ],
  target: 'es2022',
});
