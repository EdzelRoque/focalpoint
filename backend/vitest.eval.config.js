import { defineConfig } from 'vitest/config';

// `npm run eval`: the opt-in live Claude eval. Kept out of `npm test` and CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.js'],
    setupFiles: ['./evals/setup.js'],
  },
});
