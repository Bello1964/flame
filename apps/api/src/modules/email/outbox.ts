import type { EmailTemplate, Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../audit/audit.service.js';
import type {
  OrganisationInvitationPayload,
  PasswordChangedPayload,
  PasswordResetPayload,
  PlatformAdminInvitationPayload,
} from './templates.js';

export type OutboxEmail =
  | { template: 'ORGANISATION_INVITATION'; payload: OrganisationInvitationPayload }
  | { template: 'PLATFORM_ADMIN_INVITATION'; payload: PlatformAdminInvitationPayload }
  | { template: 'PASSWORD_RESET'; payload: PasswordResetPayload }
  | { template: 'PASSWORD_CHANGED'; payload: PasswordChangedPayload };

/** What a queued email belongs to: the worker skips it once that is no longer usable. */
export type OutboxSubject = { invitationId: string } | { passwordResetId: string } | null;

/**
 * Queues an email. Pass the transaction client so the email is queued only if the change
 * that needs it commits (transactional outbox). The worker delivers it.
 */
export async function enqueueEmail(
  db: Db,
  recipient: string,
  email: OutboxEmail,
  subject: OutboxSubject,
): Promise<string> {
  const row = await db.emailOutbox.create({
    data: {
      recipient,
      template: email.template satisfies EmailTemplate,
      payload: email.payload,
      ...subject,
    },
    select: { id: true },
  });
  return row.id;
}

/** The payload without its link (the only secret it holds), recording that it was erased. */
export function withoutLink(payload: Prisma.JsonValue): Prisma.InputJsonValue {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return {};
  const rest = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'link'));
  return { ...rest, linkErased: true };
}

/**
 * Cancels emails for an invitation or reset link that is no longer usable and have not
 * left the outbox: they are marked CANCELLED and their links erased, so a revoked
 * invitation or replaced reset link is never delivered. A row being sent right now is left
 * to the worker, which re-checks the invitation or reset link before sending.
 */
export async function cancelQueuedEmails(
  tx: Prisma.TransactionClient,
  subject: NonNullable<OutboxSubject>,
  reason: string,
): Promise<void> {
  const queued = await tx.emailOutbox.findMany({
    where: { ...subject, status: 'PENDING' },
    select: { id: true, payload: true },
  });
  for (const row of queued) {
    await tx.emailOutbox.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'CANCELLED', lastError: reason, payload: withoutLink(row.payload) },
    });
  }
}
