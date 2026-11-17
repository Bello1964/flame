/**
 * Transfers the supreme Platform Administrator role (the only administrator who may remove
 * others' administration rights) to another active Platform Administrator.
 *
 * Reads DATABASE_URL (from apps/api/.env locally, or the host environment): the API's own
 * restricted login is enough, since this only updates users and appends to the audit log.
 *
 * Run: npm run db:transfer-supreme-admin -w @flame/api -- <email>
 * One transaction; audited as platform_admin.supreme_transferred.
 */
import { createLogger } from '../src/lib/logger.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import { transferSupremeAdmin } from '../src/modules/platform-admin/supreme.js';

const logger = createLogger('info');

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  const email = process.argv[2];
  if (!databaseUrl) throw new Error('Set DATABASE_URL.');
  if (!email) {
    throw new Error('Usage: npm run db:transfer-supreme-admin -w @flame/api -- <email>');
  }

  // Operator tool: works across organisations (Row-Level Security system scope).
  const prisma = createPrismaClient(databaseUrl, {
    fallbackScope: { kind: 'system', reason: 'operator-script' },
  });
  try {
    const result = await transferSupremeAdmin(prisma, email);
    logger.info(result, 'Supreme Platform Administrator transferred');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Could not transfer the supreme Platform Administrator role');
  process.exitCode = 1;
});
