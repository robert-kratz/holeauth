import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'express',
    '@holeauth/core',
    '@holeauth/core/session',
    '@holeauth/core/cookies',
    '@holeauth/core/errors',
  ],
  target: 'es2022',
});
