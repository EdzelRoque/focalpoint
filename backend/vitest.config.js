import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    globalSetup: ['./test/setup/globalSetup.js'],
    setupFiles: ['./test/setup/perFile.js'],
    // One shared in-memory MongoDB: files must not run concurrently.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
