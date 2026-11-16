import { createApp } from './app.js';
import { loadEnv, toAppConfig } from './config/env.js';
import { assertRestrictedAppRole } from './lib/db-roles.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);

const config = toAppConfig(env);

// The API must connect as a restricted flame_app login, never as the schema owner.
try {
  await assertRestrictedAppRole(prisma, logger, config.isProduction);
} catch (err) {
  logger.fatal({ err }, 'Database role check failed');
  if (config.isProduction) process.exit(1);
}

const app = createApp({ logger, prisma, config });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
