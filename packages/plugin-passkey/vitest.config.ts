import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // adapter.ts is an interface-only module.
      exclude: ['src/**/*.d.ts', 'src/adapter.ts'],
      thresholds: {
        lines: 95,
        branches: 85,
        functions: 100,
        statements: 95,
      },
    },
  },
});
