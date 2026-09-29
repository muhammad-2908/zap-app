import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests never read the developer's .env; they get fixed, harmless values.
    env: {
      NODE_ENV: 'test',
      FRONTEND_URL: 'http://localhost:4200',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/zap-app-test',
    },
  },
});
