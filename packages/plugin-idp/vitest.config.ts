import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // adapter.ts / types.ts are interface-only.
      exclude: ['src/**/*.d.ts', 'src/adapter.ts', 'src/types.ts'],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 95,
        statements: 90,
      },
    },
  },
});
