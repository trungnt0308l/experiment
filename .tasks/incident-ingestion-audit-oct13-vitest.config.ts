import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['.tasks/incident-ingestion-audit-oct13-clock.ts'],
  },
});
