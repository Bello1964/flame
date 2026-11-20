/**
 * Production bootstrap: creates the first Platform Administrators and nothing else (no
 * organisation, no operational or emissions data). Safe to re-run: existing administrators
 * are left unchanged. Organisations are then created in the app by an administrator.
 *
 * Deliberately does NOT read apps/api/.env, so it can't reach the local database by
 * accident. Set these in the shell (ARCHITECTURAL_WORKFLOW.md §12.1):
 *   DATABASE_URL                      the production app login (restricted flame_app login)
 *   PLATFORM_ADMIN_1_EMAIL/_PASSWORD  becomes the supreme Platform Administrator if none exists
 *   PLATFORM_ADMIN_2_EMAIL/_PASSWORD  optional, but needed to approve a methodology edition
 *   PLATFORM_ADMIN_n_NAME             optional display name
 * Run: npm run db:bootstrap-admins -w @flame/api
 */
import { createLogger } from '../src/lib/logger.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import {
  ensurePlatformAdmins,
  platformAdminsFromEnv,
} from '../src/modules/platform-admin/bootstrap.js';

const logger = createLogger('info');

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set DATABASE_URL in the shell (production app login).');
  const accounts = platformAdminsFromEnv(process.env, 'PLATFORM_ADMIN');
  if (accounts.length === 0) {
    throw new Error('Set PLATFORM_ADMIN_1_EMAIL and PLATFORM_ADMIN_1_PASSWORD.');
  }

  const target = new URL(databaseUrl);
  logger.info(
    { host: target.hostname, database: target.pathname.slice(1), user: target.username },
    'Bootstrapping Platform Administrators',
  );

  // Operator tool: users are outside Row-Level Security, but the audit log is written in
  // system scope like the other operator scripts.
  const prisma = createPrismaClient(databaseUrl, {
    fallbackScope: { kind: 'system', reason: 'operator-script' },
  });
  try {
    const result = await ensurePlatformAdmins(prisma, accounts, 'operator_script');
    logger.info(result, 'Platform Administrators ready');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Could not bootstrap Platform Administrators');
  process.exitCode = 1;
});
