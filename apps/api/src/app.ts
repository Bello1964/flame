import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.routes.js';

export interface AppDependencies {
  logger: Logger;
  checkDatabase: DatabaseCheck;
}

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp({ logger, checkDatabase }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', healthRouter(checkDatabase));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
