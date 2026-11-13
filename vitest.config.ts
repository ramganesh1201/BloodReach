import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    testTimeout: 15000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/_backup_*/**', '**/archive/**'],
  },
});

