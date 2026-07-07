import { defineConfig } from '@playwright/test';

// Playwright specs live in tests/ (none yet). Without this, Playwright's
// default testMatch picks up the vitest unit tests in lib/**/*.test.js and
// crashes on the vitest imports.
export default defineConfig({
  testDir: 'tests',
});
