import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only include our test files, exclude reference directories
    include: ['tools/test/**/*.test.{js,ts}', 'src/**/*.test.{js,ts,jsx,tsx}'],
    exclude: ['reference/**/*', 'node_modules/**/*'],
    testTimeout: 20000, // Increase timeout for integration tests
    hookTimeout: 10000,
  },
});