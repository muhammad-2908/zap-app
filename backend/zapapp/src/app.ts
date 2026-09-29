import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';

/** Builds the Express app without starting it, so tests can drive it with supertest. */
export function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  // M3: the GitHub webhook router mounts here with express.raw(), BEFORE express.json(),
  // because signature verification needs the exact raw bytes.

  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
