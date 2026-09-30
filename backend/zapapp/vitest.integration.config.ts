import { defineConfig } from 'vitest/config';
import { testEnv } from './vitest.config.js';

/**
 * Integration tests against a real MongoDB (mongodb-memory-server). `npm run test:integration`.
 * The first run downloads a mongod binary (~100 MB), hence the long hook timeout.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: testEnv,
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
