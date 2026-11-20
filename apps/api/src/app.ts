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
import { webAppRouter } from './middleware/web-app.js';
import { requireOrganisation } from './middleware/organisation-context.js';
import { authRouter, createSignInLimiters } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionService } from './modules/auth/session.service.js';
import { accountRouter, passwordResetRouter } from './modules/auth/account.routes.js';
import { AccountService } from './modules/auth/account.service.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { workflowRouter } from './modules/workflow/workflow.routes.js';
import { calculationsRouter } from './modules/calculations/calculations.routes.js';
import { CalculationsService } from './modules/calculations/calculations.service.js';
import { InputsService } from './modules/calculations/inputs.service.js';
import {
  methodologyAdminRouter,
  methodologyPublicRouter,
} from './modules/methodology/methodology.routes.js';
import { MethodologyService } from './modules/methodology/methodology.service.js';
import { reportingRouter } from './modules/reporting/reporting.routes.js';
import { ReportingService } from './modules/reporting/reporting.service.js';
import { NuprcService } from './modules/reporting/nuprc.service.js';
import { IssuedReportsService } from './modules/reporting/issued-reports.service.js';
import { nuprcRouter } from './modules/reporting/nuprc.routes.js';
import { WorkflowService } from './modules/workflow/workflow.service.js';
import { ActivityService } from './modules/activity/activity.service.js';
import { facilitiesRouter } from './modules/facilities/facilities.routes.js';
import { FacilitiesService } from './modules/facilities/facilities.service.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.routes.js';
import { organisationRouter } from './modules/organisations/organisations.routes.js';
import { SettingsService } from './modules/organisations/settings.service.js';
import { InvitationsService } from './modules/organisations/invitations.service.js';
import { publicInvitationsRouter } from './modules/organisations/invitations.routes.js';
import { membersRouter } from './modules/organisations/members.routes.js';
import { MembersService } from './modules/organisations/members.service.js';
import { platformAdminRouter } from './modules/platform-admin/platform-admin.routes.js';
import { PlatformAdminService } from './modules/platform-admin/platform-admin.service.js';
import { devMailboxRouter } from './modules/email/dev-mailbox.routes.js';
import { buildOpenApiDocument } from './docs/openapi.js';

export interface AppDependencies {
  logger: Logger;
  prisma: PrismaClient;
  config: AppConfig;
  /** Override for tests that run without a database. */
  checkDatabase?: DatabaseCheck;
  /** Built web app to serve from this origin (production); not served when omitted. */
  webAppDir?: string;
}

/**
 * Content Security Policy: Helmet's defaults, plus jsDelivr for the Swagger UI files on
 * /docs (pinned version, checked with Subresource Integrity in api-docs-page.tsx).
 */
const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net';

const API = '/api/v1';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp({
  logger,
  prisma,
  config,
  checkDatabase,
  webAppDir,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", SWAGGER_UI_CDN],
          styleSrc: ["'self'", "'unsafe-inline'", SWAGGER_UI_CDN],
        },
      },
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(proxyMisconfigurationWarning(logger, config.trustProxy));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessions = new SessionService(prisma, config.session);
  const auth = new AuthService(prisma, sessions);
  const account = new AccountService(prisma, config.webOrigin);
  const facilities = new FacilitiesService(prisma);
  const activity = new ActivityService(prisma);
  const settings = new SettingsService(prisma);
  const workflow = new WorkflowService(prisma, activity, logger);
  const methodology = new MethodologyService(prisma);
  const inputs = new InputsService(prisma);
  const calculations = new CalculationsService(prisma, methodology);
  const reporting = new ReportingService(prisma);
  const nuprc = new NuprcService(prisma);
  const issuedReports = new IssuedReportsService(prisma, nuprc);
  const invitations = new InvitationsService(prisma, config.webOrigin);
  const members = new MembersService(prisma, workflow, calculations, invitations);
  const platformAdmin = new PlatformAdminService(prisma, invitations);

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

  // Public API description (OpenAPI 3.1), shown by the web app at /docs. Built once.
  let openApi: Record<string, unknown> | undefined;
  app.get(`${API}/openapi.json`, (_req, res) => {
    openApi ??= buildOpenApiDocument({ cookieName: config.session.cookieName });
    res.set('Cache-Control', 'public, max-age=300').json(openApi);
  });

  // The web app's files and client-side routes, before session handling: they need none.
  if (webAppDir) app.use(webAppRouter(webAppDir));

  // Everything below may use the session.
  app.use(authenticate(sessions, config.session.cookieName));
  app.use(csrfProtection(config.webOrigin, [`${API}/auth/login`]));

  // One set of sign-in limiters, shared by sign-in and password checks on invitations.
  const signInLimiters = createSignInLimiters(auth, config);
  app.use(`${API}/auth/password-reset`, passwordResetRouter(account, config));
  app.use(`${API}/auth`, authRouter(auth, sessions, config, signInLimiters));
  // The signed-in user's own name and password.
  app.use(`${API}/account`, accountRouter(account, signInLimiters));

  // Public invitation links: lookup, accept and decline (token in the body).
  app.use(
    `${API}/invitations`,
    publicInvitationsRouter(invitations, auth, sessions, config, signInLimiters),
  );

  // Development only, and only while emails stay in the outbox (no Resend): the outbox as
  // a mailbox, answering connections from this machine only. Never mounted otherwise.
  if (config.isDevelopment && config.email.mode === 'dev-mailbox') {
    app.use(`${API}/dev/mailbox`, devMailboxRouter(prisma));
  }

  // Published methodology editions are public; drafts and approval are platform-level.
  app.use(`${API}/methodology`, methodologyPublicRouter(methodology));
  app.use(`${API}/admin/methodology`, methodologyAdminRouter(methodology));
  // Organisations, owner invitations and Platform Administrators (no tenant data).
  app.use(`${API}/admin`, platformAdminRouter(platformAdmin));

  // Organisation-scoped API: auth → verified membership → per-route permission.
  const orgScoped = Router({ mergeParams: true });
  orgScoped.use(requireAuth, requireOrganisation(prisma));
  orgScoped.use(organisationRouter(prisma));
  orgScoped.use(facilitiesRouter(facilities));
  orgScoped.use(activityRouter(activity, settings));
  orgScoped.use(workflowRouter(workflow));
  orgScoped.use(calculationsRouter(calculations, inputs));
  orgScoped.use(reportingRouter(reporting));
  orgScoped.use(nuprcRouter(nuprc, issuedReports));
  orgScoped.use(membersRouter(members, invitations));
  app.use(`${API}/organisations/:organisationId`, orgScoped);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
