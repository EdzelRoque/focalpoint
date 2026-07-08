import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Unit tests live in lib/ next to the helpers they test; contract tests
    // for the three entry scripts are colocated at the root. Playwright
    // specs live in tests/ — keep the globs disjoint.
    include: ['lib/**/*.test.js', '*.test.js'],
    setupFiles: ['test/setup.js'],
  },
});
