import './config/load-env.js';
import type { Server } from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDb, describeDbError, disconnectDb } from './db/mongoose.js';
import { buildApp } from './app.js';

let server: Server | undefined;

async function main(): Promise<void> {
  try {
    await connectDb(env.MONGODB_URI);
  } catch (err) {
    logger.fatal(describeDbError(err));
    process.exit(1);
  }

  const app = buildApp();
  server = app.listen(env.PORT);
  server.on('listening', () => logger.info(`API listening on http://localhost:${env.PORT}`));
  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.fatal(
      err.code === 'EADDRINUSE' ? `Port ${env.PORT} is already in use. Stop the other process or change PORT.` : err,
    );
    process.exit(1);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void main();
