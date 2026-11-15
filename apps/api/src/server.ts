import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  logger,
  checkDatabase: async () => {
    try {
      // Fixed, parameter-free connectivity probe.
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      logger.warn({ err }, 'Database health check failed');
      return false;
    }
  },
});

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
