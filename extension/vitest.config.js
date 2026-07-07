import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Unit tests live in lib/ next to the helpers they test. Playwright
    // specs (when they exist) live elsewhere — keep the globs disjoint.
    include: ['lib/**/*.test.js'],
    setupFiles: ['test/setup.js'],
  },
});
