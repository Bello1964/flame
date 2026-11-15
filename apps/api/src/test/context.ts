import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { CSRF_HEADER, type DataResponse, type SessionResponse } from '@carbon/shared';
import { createApp, type AppDependencies } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { hashPassword } from '../modules/auth/password.js';
import { inject } from 'vitest';
import { testDatabaseUrl } from './test-database.js';

/** Connected as the restricted carbon_app login, exactly like the API in production. */
export const prisma = createPrismaClient(inject('appDatabaseUrl'));
/** Connected as the schema owner. Only for resetting the database between tests. */
export const ownerPrisma = createPrismaClient(testDatabaseUrl());
export const logger = createLogger('silent');
export const WEB_ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'Correct-Horse-Battery-1';

export const testConfig: AppConfig = {
  isProduction: false,
  webOrigin: WEB_ORIGIN,
  trustProxy: 0,
  session: {
    cookieName: 'carbon_sid',
    secureCookie: false,
    idleTimeoutMs: 60 * 60_000,
    absoluteTimeoutMs: 12 * 3_600_000,
  },
  loginRateLimit: {
    windowMs: 60_000,
    maxPerIp: 1_000,
    maxPerAccountIp: 1_000,
    maxPerAccount: 1_000,
  },
};

export function makeApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({ logger, prisma, config: testConfig, ...overrides });
}

/**
 * Wipes all tables between tests. Only the schema owner can do this: it switches off the
 * audit log's TRUNCATE guard inside one transaction, so the guard is back on before commit.
 * The app role used by the tests cannot do any of this. Test database only.
 */
export async function resetDatabase(): Promise<void> {
  testDatabaseUrl(); // re-assert the _test guard before a destructive statement
  await ownerPrisma.$transaction([
    ownerPrisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate`,
    ownerPrisma.$executeRaw`TRUNCATE TABLE audit_logs, sessions, flare_sources, assets, facilities, memberships, organisations, users CASCADE`,
    ownerPrisma.$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate`,
  ]);
}

let cachedHash: Promise<string> | undefined;

export async function createUser(
  email: string,
  options: { status?: 'ACTIVE' | 'DISABLED'; isPlatformAdmin?: boolean } = {},
) {
  cachedHash ??= hashPassword(PASSWORD);
  return prisma.user.create({
    data: {
      email,
      name: email.split('@')[0] ?? email,
      passwordHash: await cachedHash,
      status: options.status ?? 'ACTIVE',
      isPlatformAdmin: options.isPlatformAdmin ?? false,
    },
  });
}

export function createOrganisation(slug: string) {
  return prisma.organisation.create({ data: { name: `Test ${slug}`, slug } });
}

export function addMember(
  userId: string,
  organisationId: string,
  roles: Role[],
  status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
) {
  return prisma.membership.create({ data: { userId, organisationId, roles, status } });
}

export interface LoggedIn {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  session: SessionResponse;
}

/** Logs in through the real endpoint; the agent keeps the session cookie. */
export async function login(app: Express, email: string, password = PASSWORD): Promise<LoggedIn> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as DataResponse<SessionResponse>;
  return { agent, csrfToken: body.data.csrfToken, session: body.data };
}

export { CSRF_HEADER };
