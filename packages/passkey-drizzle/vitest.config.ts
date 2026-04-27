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
        branches: 90,
        // The drizzle `relations()` callback is only invoked by the query
        // builder for relational queries; our adapter tests do not use it.
        functions: 85,
        statements: 90,
      },
    },
  },
});
