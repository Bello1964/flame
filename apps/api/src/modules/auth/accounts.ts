import type { Prisma } from '../../generated/prisma/client.js';
import { withSystemScope } from '../../lib/db-scope.js';
import { recordAudit } from '../audit/audit.service.js';
import { revokeAllSessions } from './session.service.js';

/** Who caused an account change, for the audit log. */
export interface AccountActor {
  userId: string | null;
  ipAddress: string | null;
}

/**
 * Locks a user row for the rest of the transaction. Lock order across the membership
 * code: organisation, then invitation, then user (ARCHITECTURAL_WORKFLOW.md §7.2).
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

/**
 * Disables an account that no longer belongs anywhere: no ACTIVE or SUSPENDED membership
 * and not a Platform Administrator. All its sessions are revoked in the same transaction.
 * Accepting a new invitation re-enables it. Returns true when the account was disabled.
 */
export async function disableIfUnattached(
  tx: Prisma.TransactionClient,
  userId: string,
  actor: AccountActor,
  reason: 'membership_removed' | 'platform_admin_removed',
  organisationId: string | null,
): Promise<boolean> {
  await lockUser(tx, userId);
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, isPlatformAdmin: true },
  });
  if (user.status !== 'ACTIVE' || user.isPlatformAdmin) return false;
  // Memberships in every organisation count: system scope ('membership-check').
  const remaining = await withSystemScope('membership-check', () =>
    tx.membership.count({ where: { userId, status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
  );
  if (remaining > 0) return false;

  await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
  const revokedSessions = await revokeAllSessions(tx, userId);
  await recordAudit(tx, {
    organisationId,
    actorUserId: actor.userId,
    action: 'user.disabled',
    entityType: 'User',
    entityId: userId,
    metadata: { reason, revokedSessions },
    ipAddress: actor.ipAddress,
  });
  return true;
}
