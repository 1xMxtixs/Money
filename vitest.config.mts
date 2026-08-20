import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/tests/e2e/**',
      '**/__lint-fixtures__/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/domain/**/*.ts'],
      exclude: ['**/__lint-fixtures__/**', '**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve('.'),
    },
  },
});
