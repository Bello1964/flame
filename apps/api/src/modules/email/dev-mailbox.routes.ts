import { Router, type RequestHandler } from 'express';
import { notFound } from '../../lib/errors.js';
import type { DataResponse, DevMailboxEmailDto } from '@flame/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { renderEmail } from './templates.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** True for a connection from this machine. */
export function isLoopback(remoteAddress: string | undefined): boolean {
  return remoteAddress !== undefined && LOOPBACK.has(remoteAddress);
}

/**
 * 404 unless the TCP connection itself comes from this machine. Uses the socket address,
 * never X-Forwarded-For or req.ip, which a client or proxy can influence.
 */
export const loopbackOnly: RequestHandler = (req, _res, next) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    next(notFound('Route not found'));
    return;
  }
  next();
};

/**
 * GET /dev/mailbox: the most recent outbox emails, rendered, links included. app.ts mounts
 * this router only when NODE_ENV=development and emails stay in the outbox (no
 * RESEND_API_KEY), and it answers only connections from this machine. No sign-in, so the
 * local invitation flow can be tried without an email provider.
 */
export function devMailboxRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(loopbackOnly);
  router.get('/', async (_req, res) => {
    const rows = await prisma.emailOutbox.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const emails: DevMailboxEmailDto[] = rows.map((row) => {
      let rendered: { subject: string; text: string; html: string };
      try {
        rendered = renderEmail(row.template, row.payload);
      } catch {
        rendered = { subject: '(unreadable content)', text: '', html: '' };
      }
      return {
        id: row.id,
        to: row.recipient,
        template: row.template,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        ...rendered,
      };
    });
    const body: DataResponse<DevMailboxEmailDto[]> = { data: emails };
    res.json(body);
  });
  return router;
}
