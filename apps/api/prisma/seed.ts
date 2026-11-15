/**
 * Development seed: one organisation and one owner account so you can sign in locally.
 * Creates no operational or emissions data. Refuses to run in production.
 *
 * Required env: SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD (min 12 chars).
 * Run: npm run db:seed -w @carbon/api
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

  const prisma = createPrismaClient(databaseUrl);
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
    logger.info({ organisation: org.slug, user: user.email }, 'Seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Seed failed');
  process.exitCode = 1;
});
