import { defineConfig } from 'prisma/config';

// Load apps/api/.env when present (local development). In CI/production the
// environment is provided by the host.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file — rely on the process environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations run as the schema owner. The API itself connects with DATABASE_URL as
    // the restricted carbon_app login. Falls back to DATABASE_URL when no separate
    // owner URL is configured.
    url: process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
});
