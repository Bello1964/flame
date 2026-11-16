import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { authenticate, requireAuth } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { proxyMisconfigurationWarning } from './middleware/proxy-check.js';
import { requireOrganisation } from './middleware/organisation-context.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionService } from './modules/auth/session.service.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { workflowRouter } from './modules/workflow/workflow.routes.js';
import { WorkflowService } from './modules/workflow/workflow.service.js';
import { ActivityService } from './modules/activity/activity.service.js';
import { facilitiesRouter } from './modules/facilities/facilities.routes.js';
import { FacilitiesService } from './modules/facilities/facilities.service.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.routes.js';
import { organisationRouter } from './modules/organisations/organisations.routes.js';
import { SettingsService } from './modules/organisations/settings.service.js';

export interface AppDependencies {
  logger: Logger;
  prisma: PrismaClient;
  config: AppConfig;
  /** Override for tests that run without a database. */
  checkDatabase?: DatabaseCheck;
}

const API = '/api/v1';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp({ logger, prisma, config, checkDatabase }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(proxyMisconfigurationWarning(logger, config.trustProxy));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessions = new SessionService(prisma, config.session);
  const auth = new AuthService(prisma, sessions);
  const facilities = new FacilitiesService(prisma);
  const activity = new ActivityService(prisma);
  const settings = new SettingsService(prisma);
  const workflow = new WorkflowService(prisma, activity, logger);

  app.use(
    `${API}/health`,
    healthRouter(
      checkDatabase ??
        (async () => {
          try {
            // Fixed, parameter-free connectivity probe.
            await prisma.$queryRaw`SELECT 1`;
            return true;
          } catch (err) {
            logger.warn({ err }, 'Database health check failed');
            return false;
          }
        }),
    ),
  );

  // Everything below may use the session.
  app.use(authenticate(sessions, config.session.cookieName));
  app.use(csrfProtection(config.webOrigin, [`${API}/auth/login`]));

  app.use(`${API}/auth`, authRouter(auth, sessions, config));

  // Organisation-scoped API: auth → verified membership → per-route permission.
  const orgScoped = Router({ mergeParams: true });
  orgScoped.use(requireAuth, requireOrganisation(prisma));
  orgScoped.use(organisationRouter(prisma));
  orgScoped.use(facilitiesRouter(facilities));
  orgScoped.use(activityRouter(activity, settings));
  orgScoped.use(workflowRouter(workflow));
  app.use(`${API}/organisations/:organisationId`, orgScoped);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
