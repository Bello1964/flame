import type { Role } from '@flame/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { forbidden, notFound } from '../../lib/errors.js';
import type { Db } from '../audit/audit.service.js';
import { hasPermission } from './permissions.js';

/**
 * Row locks for membership and invitation changes (ARCHITECTURAL_WORKFLOW.md §7.2).
 * Lock order everywhere: organisation, then invitation, then user. Locking the
 * organisation serialises every membership change in it.
 */
export async function lockOrganisation(
  tx: Prisma.TransactionClient,
  organisationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organisations WHERE id = ${organisationId}::uuid FOR UPDATE`;
}

export async function lockInvitation(
  tx: Prisma.TransactionClient,
  invitationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM invitations WHERE id = ${invitationId}::uuid FOR UPDATE`;
}

/**
 * The caller's roles as they are now, read after the organisation is locked. The roles
 * from the start of the request may be stale (another Owner may have just changed them),
 * so membership rules are always decided on these. 404 if the caller is no longer an
 * active member; 403 without members:manage.
 */
export async function currentManagerRoles(
  tx: Prisma.TransactionClient,
  organisationId: string,
  userId: string,
): Promise<Role[]> {
  const me = await tx.membership.findUnique({
    where: { userId_organisationId: { userId, organisationId } },
    select: { status: true, roles: true },
  });
  if (me?.status !== 'ACTIVE') throw notFound();
  if (!hasPermission(me.roles, 'members:manage')) throw forbidden();
  return me.roles;
}

/**
 * An organisation is dormant when no ACTIVE member holds the Owner role. Its members
 * carry on as before; only a Platform Administrator can invite a new Owner
 * (ARCHITECTURAL_WORKFLOW.md §7.2).
 */
export async function isDormant(db: Db, organisationId: string): Promise<boolean> {
  const owners = await db.membership.count({
    where: { organisationId, status: 'ACTIVE', roles: { has: 'ORGANISATION_OWNER' } },
  });
  return owners === 0;
}
