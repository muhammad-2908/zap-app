import { configDefaults, defineConfig } from 'vitest/config';

/** Values the app needs to boot in tests. Tests never read the developer's .env. */
export const testEnv = {
  NODE_ENV: 'test',
  FRONTEND_URL: 'http://localhost:4200',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/zap-app-test',
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:4200/api/auth/github/callback',
  JWT_SECRET: 'test-jwt-secret-that-is-long-enough-123456',
  TOKEN_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  PUBLIC_WEBHOOK_URL: 'https://zap-test.ngrok-free.app/api/webhooks/github',
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret-0123456789',
};

/** Fast unit tests: no database, GitHub mocked. `npm test`. */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    env: testEnv,
  },
});
