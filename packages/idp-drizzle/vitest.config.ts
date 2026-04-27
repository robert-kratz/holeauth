import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        branches: 80,
        // The drizzle `relations()` callbacks are only invoked by the
        // relational query builder, which the adapter does not use.
        functions: 80,
        statements: 90,
      },
    },
  },
});
