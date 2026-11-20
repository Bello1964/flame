import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, prisma, resetDatabase } from '../../test/context.js';
import { verifyPassword } from '../auth/password.js';
import { ensurePlatformAdmins, platformAdminsFromEnv } from './bootstrap.js';

const PASSWORD_1 = 'First-admin-password-1';
const PASSWORD_2 = 'Second-admin-password-2';
const admin1 = { email: ' Admin1@Example.com ', password: PASSWORD_1, name: 'Admin One' };
const admin2 = { email: 'admin2@example.com', password: PASSWORD_2, name: 'Admin Two' };
const accounts = [admin1, admin2];

beforeEach(resetDatabase);

describe('ensurePlatformAdmins', () => {
  it('creates administrators only, makes the first supreme, and audits both steps', async () => {
    const result = await ensurePlatformAdmins(prisma, accounts, 'operator_script');
    expect(result).toEqual({
      created: ['admin1@example.com', 'admin2@example.com'],
      existing: [],
      supremeAssigned: 'admin1@example.com',
    });

    const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
    expect(users.map((u) => [u.email, u.isPlatformAdmin, u.isSupremeAdmin])).toEqual([
      ['admin1@example.com', true, true],
      ['admin2@example.com', true, false],
    ]);
    expect(await verifyPassword(users[0]?.passwordHash ?? '', PASSWORD_1)).toBe(true);
    // No organisation, membership or operational data.
    expect(await prisma.organisation.count()).toBe(0);
    expect(await prisma.membership.count()).toBe(0);

    // One transaction, so the entries share a timestamp: compare in action order.
    const audit = await prisma.auditLog.findMany({ orderBy: { action: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorUserId, a.metadata])).toEqual([
      ['platform_admin.bootstrapped', null, { via: 'operator_script' }],
      ['platform_admin.bootstrapped', null, { via: 'operator_script' }],
      ['platform_admin.supreme_transferred', null, { fromUserId: null, via: 'operator_script' }],
    ]);
  });

  it('is idempotent and never resets an existing administrator password', async () => {
    await ensurePlatformAdmins(prisma, accounts, 'operator_script');
    const again = await ensurePlatformAdmins(
      prisma,
      accounts.map((a) => ({ ...a, password: 'A-completely-new-password' })),
      'operator_script',
    );
    expect(again).toEqual({
      created: [],
      existing: ['admin1@example.com', 'admin2@example.com'],
      supremeAssigned: null,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'admin1@example.com' } });
    expect(await verifyPassword(user.passwordHash, PASSWORD_1)).toBe(true);
    expect(await prisma.auditLog.count()).toBe(3);
  });

  it('leaves an existing supreme administrator in place', async () => {
    const existing = await createUser('current@example.com', { isPlatformAdmin: true });
    await prisma.user.update({ where: { id: existing.id }, data: { isSupremeAdmin: true } });
    const result = await ensurePlatformAdmins(prisma, accounts, 'operator_script');
    expect(result.supremeAssigned).toBeNull();
    const supreme = await prisma.user.findMany({ where: { isSupremeAdmin: true } });
    expect(supreme.map((u) => u.email)).toEqual(['current@example.com']);
  });

  it('refuses to promote an existing account that is not an administrator', async () => {
    await createUser('admin2@example.com');
    await expect(ensurePlatformAdmins(prisma, accounts, 'operator_script')).rejects.toThrow(
      /not promoted automatically/,
    );
    // All or nothing: administrator 1 was not created either.
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('rejects short passwords, invalid emails and duplicates before touching the database', async () => {
    await expect(
      ensurePlatformAdmins(prisma, [{ ...admin2, password: 'short' }], 'seed'),
    ).rejects.toThrow(/12–256 characters/);
    await expect(
      ensurePlatformAdmins(prisma, [{ ...admin2, email: 'not-an-email' }], 'seed'),
    ).rejects.toThrow(/not a valid email/);
    await expect(ensurePlatformAdmins(prisma, [admin2, admin2], 'seed')).rejects.toThrow(
      /different email/,
    );
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('platformAdminsFromEnv', () => {
  it('reads numbered settings, skipping unset numbers', () => {
    expect(
      platformAdminsFromEnv(
        { P_2_EMAIL: 'b@example.com', P_2_PASSWORD: 'secret', P_2_NAME: ' Bee ' },
        'P',
      ),
    ).toEqual([{ email: 'b@example.com', password: 'secret', name: 'Bee' }]);
    expect(platformAdminsFromEnv({}, 'P')).toEqual([]);
  });

  it('requires a password when an email is set', () => {
    expect(() => platformAdminsFromEnv({ P_1_EMAIL: 'a@example.com' }, 'P')).toThrow(
      /P_1_PASSWORD/,
    );
  });
});
