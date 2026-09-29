// Loads backend/zapapp/.env into process.env. Imported first by server.ts so
// every later module sees the values. Tests set their env in vitest.config.ts
// instead, so they never read a developer's real .env.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
