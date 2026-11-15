import { execSync } from 'node:child_process';
import pg from 'pg';
import { ensureAppLogin } from '../lib/db-roles.js';
import { testAppDatabaseUrl, testDatabaseName, testDatabaseUrl } from './test-database.js';

/**
 * Once per test run: creates the test database if needed, applies all migrations as
 * the schema owner, then creates the restricted app login the tests connect with.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = testDatabaseName(url);

  const serverUrl = new URL(url);
  serverUrl.pathname = '/postgres';
  const server = new pg.Client({ connectionString: serverUrl.toString() });
  try {
    await server.connect();
  } catch {
    throw new Error(
      `Test database server unreachable at ${serverUrl.host}. Start it with "npm run db:up".`,
    );
  }
  try {
    const exists = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      // name is validated by testDatabaseUrl() to match ^[a-z0-9_]+_test$.
      await server.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await server.end();
  }

  // Set both variables: prisma.config.ts prefers MIGRATION_DATABASE_URL, and .env values
  // never override variables already present, so this pins migrations to the test database.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url },
    stdio: 'pipe',
  });

  const app = new URL(testAppDatabaseUrl());
  const owner = new pg.Client({ connectionString: url });
  await owner.connect();
  try {
    await ensureAppLogin(owner, decodeURIComponent(app.username), decodeURIComponent(app.password));
  } finally {
    await owner.end();
  }
}
