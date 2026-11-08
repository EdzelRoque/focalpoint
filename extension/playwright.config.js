import { defineConfig } from '@playwright/test';

// Journey suite: real headed Chromium + the real extension + the real backend
// (with MongoDB in memory, real Redis, and a fake Claude), booted once per run
// by test/journeys/harness/global-setup.js.
//
// workers: 1 because all tests share one backend and one Redis db. Each test
// registers its own student, so tests never share sessions or cache entries.
export default defineConfig({
  testDir: 'test/journeys',
  globalSetup: './test/journeys/harness/global-setup.js',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  outputDir: 'test-results',
});
