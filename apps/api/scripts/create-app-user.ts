/**
 * Creates the restricted database login the API connects as.
 *
 * Reads two URLs (from apps/api/.env locally, or the host environment):
 *   MIGRATION_DATABASE_URL  schema owner — used here to create the login
 *   DATABASE_URL            the login to create: its username and password are taken from this URL
 *
 * Run after migrations: npm run db:create-app-user -w @flame/api
 * Safe to re-run: an existing login gets its password updated and its flame_app membership confirmed.
 */
import pg from 'pg';
import { ensureAppLogin } from '../src/lib/db-roles.js';
import { createLogger } from '../src/lib/logger.js';

const logger = createLogger('info');

async function main(): Promise<void> {
  const ownerUrl = process.env['MIGRATION_DATABASE_URL'];
  const appUrl = process.env['DATABASE_URL'];
  if (!ownerUrl || !appUrl) {
    throw new Error('Set both MIGRATION_DATABASE_URL (owner) and DATABASE_URL (app login).');
  }

  const app = new URL(appUrl);
  const username = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (new URL(ownerUrl).username === app.username) {
    throw new Error(
      'DATABASE_URL and MIGRATION_DATABASE_URL use the same user; give the app its own.',
    );
  }

  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    const result = await ensureAppLogin(owner, username, password);
    logger.info({ role: username, result }, 'App database login ready');
  } finally {
    await owner.end();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Could not create the app database login');
  process.exitCode = 1;
});
