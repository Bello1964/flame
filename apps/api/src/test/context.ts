import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { CSRF_HEADER, type DataResponse, type SessionResponse } from '@flame/shared';
import { createApp, type AppDependencies } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { hashPassword } from '../modules/auth/password.js';
import { readFileSync } from 'node:fs';
import { inject } from 'vitest';
import { testDatabaseUrl } from './test-database.js';

/**
 * Test fixtures and assertions: the restricted flame_app login, in Row-Level Security system
 * scope, so tests can set up and inspect any organisation's rows.
 */
export const prisma = createPrismaClient(inject('appDatabaseUrl'), {
  fallbackScope: { kind: 'system', reason: 'test-fixtures' },
});
/**
 * The API under test: the restricted flame_app login with no fallback scope, exactly like
 * production, so Row-Level Security applies to it as it would there.
 */
export const appPrisma = createPrismaClient(inject('appDatabaseUrl'));
/** Connected as the schema owner. Only for resetting the database between tests. */
export const ownerPrisma = createPrismaClient(testDatabaseUrl());
export const logger = createLogger('silent');
export const WEB_ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'Correct-Horse-Battery-1';

export const testConfig: AppConfig = {
  isProduction: false,
  isDevelopment: false,
  webOrigin: WEB_ORIGIN,
  trustProxy: 0,
  session: {
    cookieName: 'flame_sid',
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
  email: { mode: 'dev-mailbox' },
};

export function makeApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({ logger, prisma: appPrisma, config: testConfig, ...overrides });
}

/**
 * Wipes all tables between tests. Only the schema owner can do this: it switches off the
 * TRUNCATE guards of the audit log and the activity record history inside one transaction,
 * so they are back on before commit.
 * The app role used by the tests cannot do any of this. Test database only.
 */
export async function resetDatabase(): Promise<void> {
  testDatabaseUrl(); // re-assert the _test guard before a destructive statement
  await ownerPrisma.$transaction([
    ownerPrisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate`,
    ownerPrisma.$executeRaw`ALTER TABLE activity_record_events DISABLE TRIGGER activity_record_events_no_truncate`,
    ownerPrisma.$executeRaw`ALTER TABLE calculation_events DISABLE TRIGGER calculation_events_no_truncate`,
    ownerPrisma.$executeRaw`TRUNCATE TABLE audit_logs, activity_record_events, calculation_events, methodology_editions, email_outbox, password_resets, issued_reports, invitations, sessions, flare_sources, assets, facilities, memberships, organisations, users CASCADE`,
    ownerPrisma.$executeRaw`ALTER TABLE activity_record_events ENABLE TRIGGER activity_record_events_no_truncate`,
    ownerPrisma.$executeRaw`ALTER TABLE calculation_events ENABLE TRIGGER calculation_events_no_truncate`,
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

/**
 * Loads methodology edition 1 (as a draft) exactly as the migration does, by running the
 * migration's own seed statements. resetDatabase removes it (editions reference users).
 */
export async function seedMethodology(): Promise<string> {
  const sql = readFileSync(
    new URL(
      '../../prisma/migrations/20261116210000_emissions_calculations/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const start = sql.indexOf('INSERT INTO "methodology_editions"');
  const end = sql.lastIndexOf('COMMIT;');
  const statements = sql
    .slice(start, end)
    .split(/;\s*\n(?=INSERT)/)
    .map((s) => s.trim().replace(/;$/, ''));
  for (const statement of statements) await ownerPrisma.$executeRawUnsafe(statement);
  const edition = await ownerPrisma.methodologyEdition.findFirstOrThrow({ where: { edition: 1 } });
  return edition.id;
}

/** Seeds edition 1 and approves it as the given Platform Administrator (via the database). */
export async function approvedMethodology(approverId: string): Promise<string> {
  const id = await seedMethodology();
  await ownerPrisma.methodologyEdition.update({
    where: { id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: approverId },
  });
  return id;
}

/**
 * The raw token of the latest invitation emailed to an address, read from the queued
 * email's link (the only place it exists; the database keeps only its hash). Must be read
 * before the email worker delivers the email, which erases the link.
 */
export async function inviteTokenFor(email: string): Promise<string> {
  const row = await prisma.emailOutbox.findFirst({
    where: { recipient: email },
    orderBy: { createdAt: 'desc' },
  });
  const payload = row?.payload as { link?: string } | undefined;
  const token = payload?.link?.split('/invite/')[1];
  if (!token) throw new Error(`No invitation link queued for ${email}`);
  return token;
}
