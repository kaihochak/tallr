import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only include our test files, exclude reference directories
    include: ['tools/test/**/*.test.{js,ts}', 'src/**/*.test.{js,ts,jsx,tsx}'],
    exclude: ['reference/**/*', 'node_modules/**/*'],
    testTimeout: 40000, // Increased timeout for Phase 2 integration tests (network calls)
    hookTimeout: 15000,
    // Allow longer timeouts for individual tests that need it
    slowTestThreshold: 10000,
  },
});