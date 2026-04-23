import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/jwt/index.ts',
    'src/session/index.ts',
    'src/password/index.ts',
    'src/otp/index.ts',
    'src/sso/index.ts',
    'src/adapters/index.ts',
    'src/errors/index.ts',
    'src/cookies/index.ts',
    'src/events/index.ts',
    'src/flows/index.ts',
    'src/plugins/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  external: ['@node-rs/argon2'],
});
