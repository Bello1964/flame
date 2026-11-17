/**
 * Development seed: one organisation, one owner account and optional Platform
 * Administrators, so you can sign in locally.
 * Creates no operational or emissions data. Refuses to run in production.
 *
 * Required env: SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD (min 12 chars).
 * Optional: SEED_PLATFORM_ADMIN_1_EMAIL/_PASSWORD and _2_ (Platform Administrators;
 * administrator 1 becomes the supreme Platform Administrator if there is none yet).
 * Run: npm run db:seed -w @flame/api
 */
import { createPrismaClient } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { createLogger } from '../src/lib/logger.js';

const logger = createLogger('info');

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  const databaseUrl = process.env['DATABASE_URL'];
  const email = process.env['SEED_OWNER_EMAIL']?.trim().toLowerCase();
  const password = process.env['SEED_OWNER_PASSWORD'];
  if (!databaseUrl || !email || !password || password.length < 12) {
    throw new Error(
      'Set DATABASE_URL, SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (min 12 characters).',
    );
  }

  // Operator tool: works across organisations (Row-Level Security system scope).
  const prisma = createPrismaClient(databaseUrl, {
    fallbackScope: { kind: 'system', reason: 'operator-script' },
  });
  try {
    const org = await prisma.organisation.upsert({
      where: { slug: 'demo-organisation' },
      update: {},
      create: { name: 'Demo Organisation', slug: 'demo-organisation' },
    });
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Demo Owner', passwordHash: await hashPassword(password) },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: org.id } },
      update: {},
      create: { userId: user.id, organisationId: org.id, roles: ['ORGANISATION_OWNER'] },
    });

    // Optional Platform Administrators (no organisation membership): approving a
    // methodology edition needs one who didn't prepare it, so two can be seeded.
    const admins: string[] = [];
    for (const n of ['1', '2']) {
      const adminEmail = process.env[`SEED_PLATFORM_ADMIN_${n}_EMAIL`]?.trim().toLowerCase();
      const adminPassword = process.env[`SEED_PLATFORM_ADMIN_${n}_PASSWORD`];
      if (!adminEmail) continue;
      if (!adminPassword || adminPassword.length < 12) {
        throw new Error(`Set SEED_PLATFORM_ADMIN_${n}_PASSWORD (min 12 characters).`);
      }
      const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
          email: adminEmail,
          name: `Platform Administrator ${n}`,
          passwordHash: await hashPassword(adminPassword),
          isPlatformAdmin: true,
        },
      });
      admins.push(adminEmail);

      // Administrator 1 becomes the supreme Platform Administrator (the only one who may
      // remove others' administration rights), unless someone already holds that role,
      // e.g. after npm run db:transfer-supreme-admin. Idempotent.
      if (n === '1' && admin.isPlatformAdmin && !admin.isSupremeAdmin) {
        const supreme = await prisma.user.findFirst({ where: { isSupremeAdmin: true } });
        if (supreme) {
          logger.info('A supreme Platform Administrator already exists; leaving it unchanged');
        } else {
          await prisma.user.update({ where: { id: admin.id }, data: { isSupremeAdmin: true } });
        }
      }
    }
    logger.info({ organisation: org.slug, user: user.email, admins }, 'Seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Seed failed');
  process.exitCode = 1;
});
