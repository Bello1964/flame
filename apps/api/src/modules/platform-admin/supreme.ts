import type { PrismaClient } from '../../generated/prisma/client.js';
import { recordAudit } from '../audit/audit.service.js';

export interface SupremeTransfer {
  fromUserId: string | null;
  toUserId: string;
}

/**
 * Makes an active Platform Administrator the supreme administrator, in one transaction:
 * the current one (if any) loses the flag first, because the database allows at most one.
 * Run by an operator (npm run db:transfer-supreme-admin), never through the API; audited
 * with no actor and `via: 'operator_script'`.
 */
export async function transferSupremeAdmin(
  prisma: PrismaClient,
  email: string,
): Promise<SupremeTransfer> {
  const normalised = email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    // Serialise against a concurrent transfer.
    await tx.$queryRaw`SELECT id FROM users WHERE "isSupremeAdmin" OR email = ${normalised} FOR UPDATE`;
    const target = await tx.user.findUnique({
      where: { email: normalised },
      select: { id: true, status: true, isPlatformAdmin: true, isSupremeAdmin: true },
    });
    if (!target || !target.isPlatformAdmin || target.status !== 'ACTIVE') {
      throw new Error('The target must be an active Platform Administrator.');
    }
    const current = await tx.user.findFirst({
      where: { isSupremeAdmin: true },
      select: { id: true },
    });
    if (current?.id === target.id) return { fromUserId: target.id, toUserId: target.id };

    if (current) {
      await tx.user.update({ where: { id: current.id }, data: { isSupremeAdmin: false } });
    }
    await tx.user.update({ where: { id: target.id }, data: { isSupremeAdmin: true } });
    await recordAudit(tx, {
      actorUserId: null,
      action: 'platform_admin.supreme_transferred',
      entityType: 'User',
      entityId: target.id,
      metadata: { fromUserId: current?.id ?? null, via: 'operator_script' },
    });
    return { fromUserId: current?.id ?? null, toUserId: target.id };
  });
}
