import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { githubRouter } from './modules/github/github.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { webhooksRouter } from './modules/webhooks/webhooks.routes.js';
import { zapsRouter } from './modules/zaps/zaps.routes.js';

/** Builds the Express app without starting it, so tests can drive it with supertest. */
export function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Keep OAuth codes and state out of request logs.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split('?')[0] }),
      },
    }),
  );
  app.use(cookieParser());

  // Webhooks first, with their own raw-body parser: signature verification needs the exact bytes,
  // so express.json() must not touch these requests.
  app.use('/api/webhooks', webhooksRouter);

  app.use(express.json({ limit: '100kb' }));

  // API responses are per-user: never let a browser or proxy cache them (the catalog opts back in).
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/zaps', zapsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
