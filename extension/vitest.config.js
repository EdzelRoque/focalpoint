import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Unit tests run the real extension scripts against a fake chrome API and
    // a fake backend. Journey tests (Playwright, real Chrome) live in
    // test/journeys and are run by `npm test`, so keep the globs disjoint.
    include: ['test/unit/**/*.test.js'],
    setupFiles: ['test/support/setup.js'],
  },
});
