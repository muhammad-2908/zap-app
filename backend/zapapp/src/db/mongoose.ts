import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

export type DbState = 'disconnected' | 'connected' | 'connecting' | 'disconnecting';

const STATES: Record<number, DbState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersAttached = false;

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  // Attach after the first successful connect so a failed start logs one clear error, not two.
  if (!listenersAttached) {
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
    listenersAttached = true;
  }

  // Log the database name only, never the URI (it carries the password).
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export function dbState(): DbState {
  return STATES[mongoose.connection.readyState] ?? 'disconnected';
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Turns driver errors into a one-line hint a developer can act on. */
export function describeDbError(err: unknown): string {
  const e = err as { name?: string; code?: number; message?: string };
  const msg = e?.message ?? String(err);
  if (e?.code === 18 || /bad auth|authentication failed/i.test(msg)) {
    return 'MongoDB rejected the username or password in MONGODB_URI (check Atlas > Database Access, and URL-encode special characters).';
  }
  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(msg)) {
    return 'The MongoDB host in MONGODB_URI could not be found (check the cluster address after the @).';
  }
  if (e?.name === 'MongooseServerSelectionError' || e?.name === 'MongoServerSelectionError') {
    return 'Could not reach MongoDB within 10s (check Atlas > Network Access allows your IP, and that the cluster is running).';
  }
  return msg;
}
