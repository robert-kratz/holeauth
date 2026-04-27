import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Spawning a Postgres container can be slow on cold starts.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        lines: 95,
        branches: 95,
        // The drizzle `relations()` callback is only invoked by the query
        // builder for relational queries; our adapter tests do not use it.
        functions: 85,
        statements: 95,
      },
    },
  },
});
