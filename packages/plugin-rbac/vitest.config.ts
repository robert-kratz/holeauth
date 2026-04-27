import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // adapter.ts is interface-only.
      exclude: ['src/**/*.d.ts', 'src/adapter.ts'],
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 100,
        statements: 95,
      },
    },
  },
});
