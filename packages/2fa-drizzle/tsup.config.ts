import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/pg/index.ts', 'src/mysql/index.ts', 'src/sqlite/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  external: ['@holeauth/plugin-2fa', 'drizzle-orm'],
});
