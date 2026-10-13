import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { setupFiles: ['test/setup.ts'], testTimeout: 15000,
  coverage: { provider: 'v8', include: ['src/**/*.ts'], reportsDirectory: '.wrangler/coverage', reporter: ['text', 'json', 'lcov'] } } });
