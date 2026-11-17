import type { Logger } from 'pino';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { recordAudit } from '../audit/audit.service.js';
import { withoutLink } from './outbox.js';
import { EmailSendError, type EmailSender } from './senders.js';
import { renderEmail } from './templates.js';

/** After this many attempts an email is marked FAILED for good. */
export const MAX_EMAIL_ATTEMPTS = 8;
const LAST_ERROR_MAX = 500;
/** First retry after 30 s, doubling each time, at most an hour apart. */
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 3_600_000;

export interface EmailWorkerOptions {
  /** How often the outbox is polled. */
  pollIntervalMs?: number;
  /** Rows claimed per poll. */
  batchSize?: number;
  /** A row SENDING for longer than this (e.g. after a crash) is claimed again. */
  staleClaimMs?: number;
}

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

function truncate(message: string): string {
  return message.length > LAST_ERROR_MAX ? `${message.slice(0, LAST_ERROR_MAX - 1)}…` : message;
}

/**
 * Delivers the email outbox from inside the API process (ARCHITECTURAL_WORKFLOW.md §7.2).
 *
 * Safe with several API instances: a row is claimed with a conditional update
 * (PENDING → SENDING, or a stale SENDING claim taken over), and only the instance whose
 * update matched one row sends it. Every later write is conditional on that same claim.
 * A failed send is retried with exponential backoff; after MAX_EMAIL_ATTEMPTS the row is
 * FAILED, its link erased and the failure audited. Links are also erased once sent,
 * except in the development mailbox. Recipients, links and tokens are never logged.
 */
export class EmailWorker {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly staleClaimMs: number;
  private timer: NodeJS.Timeout | null = null;
  private current: Promise<unknown> | null = null;
  private stopped = true;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: EmailSender,
    private readonly logger: Logger,
    options: EmailWorkerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.batchSize = options.batchSize ?? 10;
    this.staleClaimMs = options.staleClaimMs ?? 5 * 60_000;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.logger.info({ transport: this.sender.transport }, 'Email worker started');
    this.schedule(0);
  }

  /** Stops polling and waits for the delivery in progress, if any. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.current;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.current = this.runOnce()
        .catch((err: unknown) => {
          this.logger.error({ err }, 'Email worker poll failed');
        })
        .finally(() => {
          this.current = null;
          this.schedule(this.pollIntervalMs);
        });
    }, delayMs);
    this.timer.unref();
  }

  /** One poll: claims due rows and delivers each. Returns how many it claimed. */
  async runOnce(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.emailOutbox.findMany({
      where: {
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: now } },
          { status: 'SENDING', claimedAt: { lt: new Date(now.getTime() - this.staleClaimMs) } },
        ],
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: this.batchSize,
      select: { id: true, status: true, claimedAt: true },
    });

    let claimed = 0;
    for (const candidate of candidates) {
      const claimedAt = new Date();
      const result = await this.prisma.emailOutbox.updateMany({
        where:
          candidate.status === 'PENDING'
            ? { id: candidate.id, status: 'PENDING', nextAttemptAt: { lte: now } }
            : { id: candidate.id, status: 'SENDING', claimedAt: candidate.claimedAt },
        data: { status: 'SENDING', claimedAt, attempts: { increment: 1 } },
      });
      // Another instance took it first.
      if (result.count !== 1) continue;
      claimed += 1;
      await this.deliver(candidate.id, claimedAt);
    }
    return claimed;
  }

  private async deliver(id: string, claimedAt: Date): Promise<void> {
    const owned = { id, status: 'SENDING' as const, claimedAt };
    const row = await this.prisma.emailOutbox.findUniqueOrThrow({
      where: { id },
      include: { invitation: { select: { status: true, expiresAt: true, organisationId: true } } },
    });

    // An invitation revoked, answered or expired since the email was queued is not sent.
    if (
      row.invitation &&
      (row.invitation.status !== 'PENDING' || row.invitation.expiresAt <= new Date())
    ) {
      await this.prisma.emailOutbox.updateMany({
        where: owned,
        data: {
          status: 'CANCELLED',
          claimedAt: null,
          lastError: 'The invitation is no longer pending',
          payload: withoutLink(row.payload),
        },
      });
      return;
    }

    let error: string;
    if (row.attempts > MAX_EMAIL_ATTEMPTS) {
      // A claim that went stale on the last attempt (e.g. a crash mid-send).
      error = 'Delivery did not complete';
    } else {
      try {
        const rendered = renderEmail(row.template, row.payload);
        const { providerMessageId } = await this.sender.send({
          ...rendered,
          to: row.recipient,
          idempotencyKey: `email-outbox/${row.id}`,
        });
        await this.prisma.emailOutbox.updateMany({
          where: owned,
          data: {
            status: 'SENT',
            claimedAt: null,
            sentAt: new Date(),
            transport: this.sender.transport,
            providerMessageId,
            lastError: null,
            payload: this.sender.retainsContent
              ? (row.payload as Prisma.InputJsonValue)
              : withoutLink(row.payload),
          },
        });
        return;
      } catch (err) {
        error =
          err instanceof EmailSendError
            ? err.message
            : err instanceof z.ZodError
              ? 'The stored email content is invalid'
              : 'Unexpected error while sending';
        this.logger.warn(
          {
            outboxId: row.id,
            template: row.template,
            attempts: row.attempts,
            errorName: err instanceof Error ? err.name : typeof err,
          },
          'Email delivery attempt failed',
        );
      }
    }

    if (row.attempts < MAX_EMAIL_ATTEMPTS) {
      await this.prisma.emailOutbox.updateMany({
        where: owned,
        data: {
          status: 'PENDING',
          claimedAt: null,
          lastError: truncate(error),
          nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
        },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const failed = await tx.emailOutbox.updateMany({
        where: owned,
        data: {
          status: 'FAILED',
          claimedAt: null,
          lastError: truncate(error),
          payload: withoutLink(row.payload),
        },
      });
      if (failed.count !== 1) return;
      await recordAudit(tx, {
        organisationId: row.invitation?.organisationId ?? null,
        action: 'email.failed',
        entityType: 'EmailOutbox',
        entityId: row.id,
        metadata: {
          template: row.template,
          attempts: row.attempts,
          invitationId: row.invitationId,
          lastError: truncate(error),
        },
      });
    });
    this.logger.error(
      { outboxId: row.id, template: row.template, attempts: row.attempts },
      'Email delivery failed for good',
    );
  }
}
