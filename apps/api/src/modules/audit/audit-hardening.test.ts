import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { assertRestrictedAppRole, inspectAppRole } from '../../lib/db-roles.js';
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

  it('only warns about the owner role in development', async () => {
    const { logger, warn } = fakeLogger();
    await expect(assertRestrictedAppRole(ownerPrisma, logger, false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
