import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appPrisma,
  createOrganisation,
  createUser,
  prisma,
  resetDatabase,
} from '../test/context.js';
import { recordAudit } from '../modules/audit/audit.service.js';
import { withOrganisationScope, withSystemScope } from './db-scope.js';

/**
 * Row-Level Security (ARCHITECTURAL_WORKFLOW.md §11). These tests talk to the database as
 * the API does (the restricted flame_app login, `appPrisma`, no fallback scope) and
 * deliberately leave out organisation filters: the database alone must keep tenants apart.
 */

let orgA: string;
let orgB: string;
let facilityA: string;
let facilityB: string;

beforeEach(async () => {
  await resetDatabase();
  const user = await createUser('ada@example.com');
  orgA = (await createOrganisation('alpha')).id;
  orgB = (await createOrganisation('bravo')).id;
  const make = (organisationId: string, code: string) =>
    prisma.facility.create({
      data: { organisationId, name: code, code, createdById: user.id },
      select: { id: true },
    });
  facilityA = (await make(orgA, 'A-1')).id;
  facilityB = (await make(orgB, 'B-1')).id;
});

describe('organisation scope', () => {
  it('shows only that organisation’s rows, even without a filter', async () => {
    const seen = await withOrganisationScope(orgA, () =>
      appPrisma.facility.findMany({ select: { id: true } }),
    );
    expect(seen.map((f) => f.id)).toEqual([facilityA]);
    const orgs = await withOrganisationScope(orgA, () =>
      appPrisma.organisation.findMany({ select: { id: true } }),
    );
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
  });

  it('cannot change or delete another organisation’s rows', async () => {
    const updated = await withOrganisationScope(orgA, () =>
      appPrisma.facility.updateMany({ where: { id: facilityB }, data: { name: 'Taken' } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await withOrganisationScope(orgA, () =>
      appPrisma.facility.deleteMany({ where: { id: facilityB } }),
    );
    expect(deleted.count).toBe(0);
    const b = await prisma.facility.findUniqueOrThrow({ where: { id: facilityB } });
    expect(b.name).toBe('B-1');
  });

  it('refuses to create or move a row into another organisation', async () => {
    const user = await prisma.user.findFirstOrThrow();
    await expect(
      withOrganisationScope(orgA, () =>
        appPrisma.facility.create({
          data: { organisationId: orgB, name: 'X', code: 'X', createdById: user.id },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withOrganisationScope(orgA, () =>
        appPrisma.facility.update({ where: { id: facilityA }, data: { organisationId: orgB } }),
      ),
    ).rejects.toThrow();
  });

  it('applies inside interactive transactions, including a system step in the middle', async () => {
    const result = await withOrganisationScope(orgA, () =>
      appPrisma.$transaction(async (tx) => {
        const before = await tx.facility.count();
        const all = await withSystemScope('membership-check', () => tx.facility.count());
        const after = await tx.facility.count();
        return { before, all, after };
      }),
    );
    expect(result).toEqual({ before: 1, all: 2, after: 1 });
  });
});

describe('no scope', () => {
  it('sees no organisation rows and cannot write any (fail closed)', async () => {
    expect(await appPrisma.facility.count()).toBe(0);
    expect(await appPrisma.organisation.count()).toBe(0);
    const user = await prisma.user.findFirstOrThrow();
    await expect(
      appPrisma.facility.create({
        data: { organisationId: orgA, name: 'X', code: 'X', createdById: user.id },
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('never inherits a scope left on a pooled connection', async () => {
    for (let i = 0; i < 5; i += 1) {
      await withSystemScope('membership-check', () => appPrisma.facility.count());
      await withOrganisationScope(orgA, () => appPrisma.facility.count());
    }
    const unscoped = await Promise.all(
      Array.from({ length: 10 }, () => appPrisma.facility.count()),
    );
    expect(unscoped.every((n) => n === 0)).toBe(true);
  });
});

describe('concurrent requests in different scopes', () => {
  // Prisma batches findUnique calls made in the same tick; each must still run in its
  // own caller's scope (lib/prisma.ts turns that batching off).
  it('keeps each findUnique in its own scope', async () => {
    const [aSeesA, bSeesB, bSeesA, unscopedSeesA, systemSeesB] = await Promise.all([
      withOrganisationScope(orgA, () =>
        appPrisma.facility.findUnique({ where: { id: facilityA } }),
      ),
      withOrganisationScope(orgB, () =>
        appPrisma.facility.findUnique({ where: { id: facilityB } }),
      ),
      withOrganisationScope(orgB, () =>
        appPrisma.facility.findUnique({ where: { id: facilityA } }),
      ),
      appPrisma.facility.findUnique({ where: { id: facilityA } }),
      withSystemScope('platform-admin', () =>
        appPrisma.facility.findUnique({ where: { id: facilityB } }),
      ),
    ]);
    expect(aSeesA?.id).toBe(facilityA);
    expect(bSeesB?.id).toBe(facilityB);
    expect(bSeesA).toBeNull();
    expect(unscopedSeesA).toBeNull();
    expect(systemSeesB?.id).toBe(facilityB);
  });

  it('keeps findUnique in scope inside concurrent interactive transactions', async () => {
    const [inA, inB] = await Promise.all([
      withOrganisationScope(orgA, () =>
        appPrisma.$transaction(async (tx) => [
          await tx.facility.findUnique({ where: { id: facilityA } }),
          await tx.facility.findUnique({ where: { id: facilityB } }),
        ]),
      ),
      withOrganisationScope(orgB, () =>
        appPrisma.$transaction(async (tx) => [
          await tx.facility.findUnique({ where: { id: facilityA } }),
          await tx.facility.findUnique({ where: { id: facilityB } }),
        ]),
      ),
    ]);
    expect(inA.map((f) => f?.id ?? null)).toEqual([facilityA, null]);
    expect(inB.map((f) => f?.id ?? null)).toEqual([null, facilityB]);
  });

  it('refuses array transactions while a scope is active', async () => {
    await expect(
      withOrganisationScope(orgA, () =>
        appPrisma.$transaction([appPrisma.facility.findUnique({ where: { id: facilityA } })]),
      ),
    ).rejects.toThrow(/not scope-safe/);
  });
});

describe('connection safeguards', () => {
  it('ends transactions left idle, so they cannot hold locks indefinitely', async () => {
    const rows = await appPrisma.$queryRaw<{ value: string }[]>`
      SELECT current_setting('idle_in_transaction_session_timeout') AS value`;
    expect(rows[0]?.value).toBe('1min');
  });
});

describe('system scope', () => {
  it('sees every organisation', async () => {
    const all = await withSystemScope('platform-admin', () => appPrisma.facility.count());
    expect(all).toBe(2);
  });
});

describe('audit log', () => {
  it('lets anyone write entries without an organisation but only system scope read them', async () => {
    await recordAudit(appPrisma, { action: 'test.unscoped', entityType: 'Test' });
    await withOrganisationScope(orgA, () =>
      recordAudit(appPrisma, { organisationId: orgA, action: 'test.a', entityType: 'Test' }),
    );

    const fromA = await withOrganisationScope(orgA, () =>
      appPrisma.auditLog.findMany({ select: { action: true } }),
    );
    expect(fromA.map((r) => r.action)).toEqual(['test.a']);
    expect(await appPrisma.auditLog.count()).toBe(0);
    const system = await withSystemScope('platform-admin', () => appPrisma.auditLog.count());
    expect(system).toBe(2);

    // An organisation cannot write into another organisation's audit trail.
    await expect(
      withOrganisationScope(orgA, () =>
        recordAudit(appPrisma, { organisationId: orgB, action: 'test.b', entityType: 'Test' }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

/**
 * The approved places that switch to system scope (§11). A new call site fails this test
 * until it is reviewed and added here.
 */
const APPROVED_SYSTEM_SCOPE_CALLS: Record<string, string[]> = {
  'modules/auth/accounts.ts': ['membership-check'],
  'modules/auth/auth.service.ts': ['session'],
  'modules/email/email-worker.ts': ['email-worker'],
  'modules/methodology/methodology.routes.ts': ['platform-admin'],
  'modules/organisations/invitations.routes.ts': ['invitation-link'],
  'modules/platform-admin/platform-admin.routes.ts': ['platform-admin'],
};

describe('system scope call sites', () => {
  it('are exactly the approved list', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const found: Record<string, string[]> = {};
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== 'generated' && name !== 'test') walk(path);
          continue;
        }
        if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
        const text = readFileSync(path, 'utf8');
        const file = relative(root, path).split(sep).join('/');
        // Every call names its reason as a literal, so this list is complete.
        const calls = text.match(/withSystemScope\(/g)?.length ?? 0;
        const literal = text.match(/withSystemScope\(\s*'[a-z-]+'/g)?.length ?? 0;
        if (file !== 'lib/db-scope.ts') expect(literal, file).toBe(calls);
        // A client whose every query falls back to system scope is for scripts and tests
        // only, never the API.
        if (file !== 'lib/prisma.ts') expect(text, file).not.toMatch(/fallbackScope/);
        const reasons = [...text.matchAll(/withSystemScope\(\s*'([a-z-]+)'/g)]
          .map((m) => m[1]!)
          .sort();
        if (reasons.length > 0) found[file] = reasons;
      }
    };
    walk(root);
    expect(found).toEqual(APPROVED_SYSTEM_SCOPE_CALLS);
  });
});
