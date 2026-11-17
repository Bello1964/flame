import {
  MEMBERSHIP_ERROR_CODES as CODES,
  type MemberAction,
  type MemberDto,
  type MemberRemovalDto,
  type Role,
} from '@flame/shared';
import type {
  Membership,
  MembershipStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import type { Caller } from '../activity/activity.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { disableIfUnattached } from '../auth/accounts.js';
import type { CalculationsService } from '../calculations/calculations.service.js';
import type { WorkflowService } from '../workflow/workflow.service.js';
import type { AutomaticRevocation, InvitationsService } from './invitations.service.js';
import { currentManagerRoles, isDormant, lockOrganisation } from './locks.js';
import { hasPermission } from './permissions.js';

const OWNER: Role = 'ORGANISATION_OWNER';

const memberSelect = {
  id: true,
  userId: true,
  roles: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.MembershipSelect;

type MemberRow = Prisma.MembershipGetPayload<{ select: typeof memberSelect }>;

function toDto(row: MemberRow, viewerId: string): MemberDto {
  return {
    membershipId: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    roles: row.roles,
    status: row.status,
    joinedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isSelf: row.userId === viewerId,
  };
}

const sameRoles = (a: readonly Role[], b: readonly Role[]) =>
  a.length === b.length && a.every((r) => b.includes(r));

const CLAIM_RELEASE_COMMENT =
  'Released automatically: the reviewer was removed from the organisation.';

/**
 * Membership management (ARCHITECTURAL_WORKFLOW.md §7.2). Every change runs in one
 * transaction with the organisation row locked and the caller's own roles re-read:
 * - Nobody changes their own roles or suspends or removes themselves.
 * - Only an Owner grants the Owner role. Administrators may take it away, and may
 *   suspend, reinstate or remove Owners, including the last one.
 * An organisation left with no ACTIVE member holding the Owner role is *dormant*: its
 * members carry on as before, the change is audited with `organisationDormant: true`, and
 * a Platform Administrator can invite a new Owner. Suspension and removal take effect on
 * the member's next request (the organisation context only accepts ACTIVE memberships).
 * Memberships are never deleted.
 *
 * A member who loses the authority to invite loses their pending invitations too, in the
 * same transaction: all of them in this organisation when they are suspended, removed or
 * no longer have members:manage, and those granting the Owner role when they lose it.
 */
export class MembersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly workflow: WorkflowService,
    private readonly calculations: CalculationsService,
    private readonly invitations: InvitationsService,
  ) {}

  async list(caller: Caller, includeRemoved: boolean): Promise<MemberDto[]> {
    const rows = await this.prisma.membership.findMany({
      where: {
        organisationId: caller.organisationId,
        ...(includeRemoved ? {} : { status: { in: ['ACTIVE', 'SUSPENDED'] } }),
      },
      select: memberSelect,
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((r) => toDto(r, caller.userId));
  }

  async updateRoles(caller: Caller, membershipId: string, roles: Role[]): Promise<MemberDto> {
    await this.prisma.$transaction(async (tx) => {
      const { target, callerRoles } = await this.loadTarget(tx, caller, membershipId);
      if (target.status === 'REMOVED') {
        throw conflict('This member was removed. Invite them again to give them roles.');
      }
      const grantsOwner = !target.roles.includes(OWNER) && roles.includes(OWNER);
      if (grantsOwner && !callerRoles.includes(OWNER)) {
        throw new AppError(403, CODES.OWNER_ONLY, 'Only an Owner can grant the Owner role');
      }
      if (sameRoles(target.roles, roles)) return;
      await tx.membership.update({ where: { id: target.id }, data: { roles } });
      await this.audit(tx, caller, 'membership.roles_changed', target, {
        fromRoles: target.roles,
        toRoles: roles,
        ...(await this.dormancy(tx, caller.organisationId, target)),
      });
      if (
        hasPermission(target.roles, 'members:manage') &&
        !hasPermission(roles, 'members:manage')
      ) {
        await this.revokeInvitationsOf(tx, caller, target, 'inviter_lost_member_management');
      } else if (target.roles.includes(OWNER) && !roles.includes(OWNER)) {
        await this.revokeInvitationsOf(tx, caller, target, 'inviter_lost_owner_role', {
          roles: { has: OWNER },
        });
      }
    });
    return this.get(caller, membershipId);
  }

  /** Suspend (ACTIVE → SUSPENDED) or reinstate (SUSPENDED → ACTIVE). */
  async setSuspended(
    caller: Caller,
    membershipId: string,
    action: Exclude<MemberAction, 'remove'>,
  ): Promise<MemberDto> {
    const [from, to]: [MembershipStatus, MembershipStatus] =
      action === 'suspend' ? ['ACTIVE', 'SUSPENDED'] : ['SUSPENDED', 'ACTIVE'];
    await this.prisma.$transaction(async (tx) => {
      const { target } = await this.loadTarget(tx, caller, membershipId);
      if (target.status !== from) {
        throw conflict(
          action === 'suspend'
            ? 'Only an active member can be suspended'
            : 'Only a suspended member can be reinstated',
        );
      }
      await tx.membership.update({ where: { id: target.id }, data: { status: to } });
      await this.audit(
        tx,
        caller,
        action === 'suspend' ? 'membership.suspended' : 'membership.reinstated',
        target,
        {
          fromStatus: from,
          toStatus: to,
          ...(await this.dormancy(tx, caller.organisationId, target)),
        },
      );
      if (action === 'suspend') {
        await this.revokeInvitationsOf(tx, caller, target, 'inviter_suspended');
      }
    });
    return this.get(caller, membershipId);
  }

  /**
   * Removes a member (ACTIVE or SUSPENDED → REMOVED). In the same transaction: releases
   * the review claims they hold on this organisation's activity records and calculations,
   * and, when they have no other ACTIVE or SUSPENDED membership and are not a Platform
   * Administrator, disables their account and revokes all their sessions.
   */
  async remove(caller: Caller, membershipId: string): Promise<MemberRemovalDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const { target } = await this.loadTarget(tx, caller, membershipId);
      if (target.status === 'REMOVED') throw conflict('This member has already been removed');
      await tx.membership.update({ where: { id: target.id }, data: { status: 'REMOVED' } });
      await this.revokeInvitationsOf(tx, caller, target, 'inviter_removed');

      // Lock order: calculations before activity records, as calculation approval does.
      const calculations = await this.calculations.releaseClaimsHeldBy(
        tx,
        caller,
        target.userId,
        CLAIM_RELEASE_COMMENT,
      );
      const activityRecords = await this.workflow.releaseClaimsHeldBy(
        tx,
        caller,
        target.userId,
        CLAIM_RELEASE_COMMENT,
      );
      await this.audit(tx, caller, 'membership.removed', target, {
        fromStatus: target.status,
        toStatus: 'REMOVED',
        roles: target.roles,
        releasedClaims: { activityRecords, calculations },
        ...(await this.dormancy(tx, caller.organisationId, target)),
      });
      const accountDisabled = await disableIfUnattached(
        tx,
        target.userId,
        caller,
        'membership_removed',
        caller.organisationId,
      );
      return { releasedClaims: { activityRecords, calculations }, accountDisabled };
    });
    return { member: await this.get(caller, membershipId), ...result };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Revokes the target's valid invitations to this organisation that they issued as a
   * member (not Owner invitations they issued as a Platform Administrator).
   */
  private revokeInvitationsOf(
    tx: Prisma.TransactionClient,
    caller: Caller,
    target: Membership,
    reason: AutomaticRevocation,
    where: Prisma.InvitationWhereInput = {},
  ): Promise<number> {
    return this.invitations.revokeIssuedBy(
      tx,
      target.userId,
      {
        ...where,
        kind: 'ORGANISATION',
        organisationId: caller.organisationId,
        issuedByPlatform: false,
      },
      caller,
      reason,
    );
  }

  private async get(caller: Caller, membershipId: string): Promise<MemberDto> {
    const row = await this.prisma.membership.findFirst({
      where: { id: membershipId, organisationId: caller.organisationId },
      select: memberSelect,
    });
    if (!row) throw notFound('Member not found');
    return toDto(row, caller.userId);
  }

  /**
   * Locks the organisation, re-reads the caller's own roles (404 if no longer an active
   * member, 403 without members:manage), then loads the membership (404 if not in this
   * organisation; 403 if it is the caller's own).
   */
  private async loadTarget(
    tx: Prisma.TransactionClient,
    caller: Caller,
    membershipId: string,
  ): Promise<{ target: Membership; callerRoles: Role[] }> {
    await lockOrganisation(tx, caller.organisationId);
    const callerRoles = await currentManagerRoles(tx, caller.organisationId, caller.userId);
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organisationId: caller.organisationId },
    });
    if (!target) throw notFound('Member not found');
    if (target.userId === caller.userId) {
      throw new AppError(
        403,
        CODES.SELF_CHANGE,
        'You can’t change your own roles or suspend or remove yourself. Ask another administrator.',
      );
    }
    return { target, callerRoles };
  }

  /**
   * `{ organisationDormant: true }` when this change (to `before`, already written) left the
   * organisation with no ACTIVE member holding the Owner role; otherwise nothing.
   */
  private async dormancy(
    tx: Prisma.TransactionClient,
    organisationId: string,
    before: Membership,
  ): Promise<{ organisationDormant?: true }> {
    if (before.status !== 'ACTIVE' || !before.roles.includes(OWNER)) return {};
    return (await isDormant(tx, organisationId)) ? { organisationDormant: true } : {};
  }

  private audit(
    tx: Prisma.TransactionClient,
    caller: Caller,
    action: string,
    target: Membership,
    metadata: Record<string, Prisma.InputJsonValue>,
  ) {
    return recordAudit(tx, {
      organisationId: caller.organisationId,
      actorUserId: caller.userId,
      action,
      entityType: 'Membership',
      entityId: target.id,
      metadata: { userId: target.userId, ...metadata },
      ipAddress: caller.ipAddress,
    });
  }
}
