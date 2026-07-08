import { defineConfig } from '@playwright/test';

// Journey suite: real headed Chromium + real local backend/Mongo/Redis,
// booted once per run by tests/global-setup.js (which also serves the local
// test pages and prepares a rewritten extension copy).
//
// workers: 1 because all tests share one backend, one Redis db, and one test
// user (who may hold at most one active session at a time).
export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.js',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
});
