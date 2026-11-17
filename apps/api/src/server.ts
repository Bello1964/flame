import { createApp } from './app.js';
import { loadEnv, toAppConfig } from './config/env.js';
import { assertRestrictedAppRole } from './lib/db-roles.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { EmailWorker } from './modules/email/email-worker.js';
import { createEmailSender } from './modules/email/senders.js';

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

// Delivers the email outbox (Resend, or the development mailbox without RESEND_API_KEY).
if (config.email.mode === 'dev-mailbox') {
  logger.warn('RESEND_API_KEY is not set: emails stay in the outbox; see GET /api/v1/dev/mailbox');
}
const emailWorker = new EmailWorker(prisma, createEmailSender(config.email), logger);
emailWorker.start();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await emailWorker.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
