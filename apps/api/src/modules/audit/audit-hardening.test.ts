import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { assertRestrictedAppRole, inspectAppRole } from '../../lib/db-roles.js';
import { createPrismaClient } from '../../lib/prisma.js';
import { testDatabaseUrl } from '../../test/test-database.js';
import {
  createUser,
  login,
  makeApp,
  ownerPrisma,
  prisma,
  resetDatabase,
} from '../../test/context.js';

const DENIED = /permission denied|must be owner/i;

beforeEach(async () => {
  await resetDatabase();
  // A real audit row, written through the API as the restricted app role.
  await createUser('ada@example.com');
  await login(makeApp(), 'ada@example.com');
});

describe('audit log, as the restricted app role (what the API connects as)', () => {
  it('can append and read audit entries', async () => {
    expect(await prisma.auditLog.count({ where: { action: 'auth.login_succeeded' } })).toBe(1);
  });

  it('cannot update, delete or truncate audit entries', async () => {
    await expect(prisma.$executeRaw`UPDATE audit_logs SET action = 'tampered'`).rejects.toThrow(
      DENIED,
    );
    await expect(prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(DENIED);
    await expect(prisma.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(DENIED);
    expect(await ownerPrisma.auditLog.count()).toBe(1);
  });

  it('cannot disable or drop the audit triggers', async () => {
    await expect(
      prisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only`,
    ).rejects.toThrow(DENIED);
    await expect(
      prisma.$executeRaw`DROP TRIGGER audit_logs_no_truncate ON audit_logs`,
    ).rejects.toThrow(DENIED);
  });

  it('cannot read migration history or create tables', async () => {
    await expect(prisma.$queryRaw`SELECT * FROM _prisma_migrations`).rejects.toThrow(DENIED);
    await expect(prisma.$executeRaw`CREATE TABLE sneaky (id int)`).rejects.toThrow(DENIED);
  });
});

describe('audit log, as the schema owner', () => {
  it('rejects row updates, deletes and TRUNCATE through the triggers', async () => {
    await expect(
      ownerPrisma.$executeRaw`UPDATE audit_logs SET action = 'tampered'`,
    ).rejects.toThrow(/append-only/);
    await expect(ownerPrisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
    await expect(ownerPrisma.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(/append-only/);
    expect(await ownerPrisma.auditLog.count()).toBe(1);
  });
});

describe('startup role check', () => {
  function fakeLogger() {
    const warn = vi.fn();
    return { logger: { warn } as unknown as Logger, warn };
  }

  it('reports the app role as unable to modify or own the audit log', async () => {
    expect(await inspectAppRole(prisma)).toMatchObject({
      canUpdateAuditLog: false,
      canDeleteAuditLog: false,
      canTruncateAuditLog: false,
      ownsAuditLog: false,
    });
  });

  it('accepts the app role, even in production', async () => {
    const { logger, warn } = fakeLogger();
    await expect(assertRestrictedAppRole(prisma, logger, true)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses the owner role in production', async () => {
    const { logger } = fakeLogger();
    await expect(assertRestrictedAppRole(ownerPrisma, logger, true)).rejects.toThrow(
      /can modify or own audit_logs/,
    );
  });

  it('refuses, in production, a login that could delete audit entries', async () => {
    const name = 'flame_role_delete_probe';
    const password = 'delete-probe-password-1';
    await ownerPrisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${name}`);
    await ownerPrisma.$executeRawUnsafe(
      `CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE flame_app`,
    );
    await ownerPrisma.$executeRawUnsafe(`GRANT DELETE ON audit_logs TO ${name}`);
    const url = new URL(testDatabaseUrl());
    url.username = name;
    url.password = password;
    const probe = createPrismaClient(url.toString());
    try {
      expect(await inspectAppRole(probe)).toMatchObject({
        canDeleteAuditLog: true,
        canUpdateAuditLog: false,
        canTruncateAuditLog: false,
        ownsAuditLog: false,
      });
      const { logger } = fakeLogger();
      await expect(assertRestrictedAppRole(probe, logger, true)).rejects.toThrow(
        /can modify or own audit_logs/,
      );
    } finally {
      await probe.$disconnect();
      await ownerPrisma.$executeRawUnsafe(`REVOKE DELETE ON audit_logs FROM ${name}`);
      await ownerPrisma.$executeRawUnsafe(`DROP ROLE ${name}`);
    }
  });

  it('only warns about the owner role in development', async () => {
    const { logger, warn } = fakeLogger();
    await expect(assertRestrictedAppRole(ownerPrisma, logger, false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

/**
 * Approved privileges of the app role, per table. Every table in the schema must be
 * listed. A new table makes this test fail until it is added here deliberately; an
 * append-only table (calculation versions, approvals, ...) must be listed with
 * INSERT and SELECT only, and its migration must REVOKE UPDATE and DELETE.
 */
const CRUD = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
const APPEND_ONLY = ['INSERT', 'SELECT'];
const NONE: string[] = [];
const EXPECTED_APP_PRIVILEGES: Record<string, string[]> = {
  _prisma_migrations: NONE,
  // Drafts are edited in place (every change audited); approved, immutable records
  // arrive with the review workflow and will be append-only.
  activity_records: CRUD,
  assets: CRUD,
  audit_logs: APPEND_ONLY,
  facilities: CRUD,
  flare_sources: CRUD,
  memberships: CRUD,
  organisations: CRUD,
  sessions: CRUD,
  users: CRUD,
};

describe('app role privileges across all tables', () => {
  it('match the approved list exactly, so new tables need a deliberate decision', async () => {
    const rows = await ownerPrisma.$queryRaw<{ table_name: string; privileges: string[] | null }[]>`
      SELECT t.table_name,
             array_agg(g.privilege_type::text ORDER BY g.privilege_type)
               FILTER (WHERE g.privilege_type IS NOT NULL) AS privileges
        FROM information_schema.tables t
        LEFT JOIN information_schema.role_table_grants g
          ON g.table_schema = t.table_schema
         AND g.table_name = t.table_name
         AND g.grantee = 'flame_app'
       WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       GROUP BY t.table_name
       ORDER BY t.table_name`;

    const actual = Object.fromEntries(rows.map((r) => [r.table_name, r.privileges ?? []]));
    expect(actual).toEqual(EXPECTED_APP_PRIVILEGES);
  });
});
