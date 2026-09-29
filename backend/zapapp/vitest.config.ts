import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests never read the developer's .env; they get fixed, harmless values.
    env: {
      NODE_ENV: 'test',
      FRONTEND_URL: 'http://localhost:4200',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/zap-app-test',
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:4200/api/auth/github/callback',
      JWT_SECRET: 'test-jwt-secret-that-is-long-enough-123456',
      TOKEN_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    },
  },
});
