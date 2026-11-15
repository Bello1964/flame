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
    url: process.env['DATABASE_URL'] ?? '',
  },
});
