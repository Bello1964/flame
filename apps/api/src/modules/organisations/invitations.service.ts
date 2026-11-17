import { randomBytes } from 'node:crypto';
import {
  INVITATION_VALIDITY_DAYS,
  MEMBERSHIP_ERROR_CODES as CODES,
  type EmailDeliveryStatus,
  type InvitationDto,
  type InvitationLookupDto,
  type InvitationStatus,
  type Role,
} from '@flame/shared';
import {
  Prisma,
  type EmailStatus,
  type Invitation,
  type InvitationKind,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { AppError, conflict, fieldErrors, notFound, unauthorized } from '../../lib/errors.js';
import type { Caller } from '../activity/activity.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { lockUser } from '../auth/accounts.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { hashToken } from '../auth/session.service.js';
import { cancelQueuedEmails, enqueueEmail } from '../email/outbox.js';
import { currentManagerRoles, isDormant, lockInvitation, lockOrganisation } from './locks.js';
import {
  NEW_PASSWORD_MIN,
  normaliseRoles,
  type InvitationAcceptInput,
  type InvitationCreateInput,
} from './members.schemas.js';

const VALIDITY_MS = INVITATION_VALIDITY_DAYS * 24 * 3_600_000;

/** How long answered, revoked and expired invitations stay in the organisation's list. */
const RECENT_DAYS = 30;

const include = {
  invitedBy: { select: { id: true, name: true } },
  emails: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
} satisfies Prisma.InvitationInclude;

type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof include }>;

/** Someone acting on invitations, for the audit log. */
export interface InvitationActor {
  userId: string;
  ipAddress: string | null;
}

/** The session (if any) the public accept request arrived with. */
export interface AcceptSession {
  userId: string;
  sessionId: string;
}

/**
 * Why an invitation was revoked without anyone pressing "revoke": the person who issued
 * it lost the authority to (ARCHITECTURAL_WORKFLOW.md §7.2).
 */
export type AutomaticRevocation =
  | 'inviter_removed'
  | 'inviter_suspended'
  | 'inviter_lost_owner_role'
  | 'inviter_lost_member_management'
  | 'inviter_lost_platform_admin';

export interface AcceptResult {
  userId: string;
  /** True when the client must be given a new session (new account, or password given). */
  openSession: boolean;
}

/** A PENDING invitation past its expiry is EXPIRED, whether or not the row says so yet. */
export function effectiveStatus(
  inv: { status: Invitation['status']; expiresAt: Date },
  now: Date = new Date(),
): InvitationStatus {
  return inv.status === 'PENDING' && inv.expiresAt <= now ? 'EXPIRED' : inv.status;
}

function deliveryOf(status: EmailStatus | undefined): EmailDeliveryStatus | null {
  switch (status) {
    case undefined:
      return null;
    case 'PENDING':
    case 'SENDING':
      return 'QUEUED';
    case 'SENT':
      return 'SENT';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
  }
}

export function toInvitationDto(row: InvitationRow, now: Date = new Date()): InvitationDto {
  return {
    id: row.id,
    kind: row.kind,
    organisationId: row.organisationId,
    email: row.email,
    roles: row.roles,
    status: effectiveStatus(row, now),
    invitedBy: row.invitedBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    delivery: deliveryOf(row.emails[0]?.status),
  };
}

const NOT_PENDING_MESSAGE: Record<Exclude<InvitationStatus, 'PENDING' | 'EXPIRED'>, string> = {
  ACCEPTED: 'This invitation has already been accepted',
  DECLINED: 'This invitation was declined',
  REVOKED: 'This invitation was withdrawn',
};

/** 409 unless the invitation can still be answered. */
function assertPending(inv: Invitation, now: Date): void {
  const status = effectiveStatus(inv, now);
  if (status === 'PENDING') return;
  if (status === 'EXPIRED') {
    throw new AppError(409, CODES.INVITATION_EXPIRED, 'This invitation has expired');
  }
  throw new AppError(409, CODES.INVITATION_NOT_PENDING, NOT_PENDING_MESSAGE[status]);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const INVALID_LINK = 'This invitation link is not valid';

/**
 * Invitations to organisations and to platform administration
 * (ARCHITECTURAL_WORKFLOW.md §7.2). The link token is random (32 bytes); only its SHA-256
 * hash is stored, and the raw token exists only in the queued email until it is sent.
 * Every state change is a conditional update on PENDING-and-not-expired inside a
 * transaction with the row locked, so a token can be used once.
 */
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly webOrigin: string,
  ) {}

  // ─── Issuing (organisation and platform) ───────────────────────────────────

  /**
   * Creates an invitation and queues its email in the caller's transaction. An expired
   * row still marked PENDING is first flipped to EXPIRED; a valid pending invitation for
   * the same email (and organisation) is refused: the inviter must revoke it first.
   */
  async issue(
    tx: Prisma.TransactionClient,
    params: {
      kind: InvitationKind;
      organisation: { id: string; name: string } | null;
      email: string;
      roles: Role[];
      inviter: InvitationActor;
      /** A Platform Administrator's Owner invitation (new or dormant organisation). */
      issuedByPlatform?: boolean;
    },
  ): Promise<string> {
    const now = new Date();
    const scope = {
      kind: params.kind,
      organisationId: params.organisation?.id ?? null,
      email: params.email,
    };
    await tx.invitation.updateMany({
      where: { ...scope, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    const pending = await tx.invitation.findFirst({
      where: { ...scope, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw pendingExists();

    const inviter = await tx.user.findUniqueOrThrow({
      where: { id: params.inviter.userId },
      select: { name: true },
    });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + VALIDITY_MS);
    let invitation: Invitation;
    try {
      invitation = await tx.invitation.create({
        data: {
          ...scope,
          roles: params.roles,
          tokenHash: hashToken(token),
          invitedById: params.inviter.userId,
          issuedByPlatform: params.issuedByPlatform ?? false,
          expiresAt,
        },
      });
    } catch (err) {
      // A concurrent request created one first (partial unique index).
      if (isUniqueViolation(err)) throw pendingExists();
      throw err;
    }

    const link = `${this.webOrigin}/invite/${token}`;
    await enqueueEmail(
      tx,
      params.email,
      params.organisation
        ? {
            template: 'ORGANISATION_INVITATION',
            payload: {
              inviterName: inviter.name,
              organisationName: params.organisation.name,
              roles: params.roles,
              expiresAt: expiresAt.toISOString(),
              link,
            },
          }
        : {
            template: 'PLATFORM_ADMIN_INVITATION',
            payload: { inviterName: inviter.name, expiresAt: expiresAt.toISOString(), link },
          },
      { invitationId: invitation.id },
    );
    await recordAudit(tx, {
      organisationId: scope.organisationId,
      actorUserId: params.inviter.userId,
      action: 'invitation.created',
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: {
        kind: params.kind,
        email: params.email,
        roles: params.roles,
        expiresAt: expiresAt.toISOString(),
        ...(params.issuedByPlatform ? { issuedByPlatform: true } : {}),
      },
      ipAddress: params.inviter.ipAddress,
    });
    return invitation.id;
  }

  /**
   * 409 when the email already belongs to an ACTIVE or SUSPENDED member of the
   * organisation. A REMOVED member may be invited again, and so may an ACTIVE member by a
   * Platform Administrator's Owner invitation of a dormant organisation (`allowActive`).
   * Only the organisation in question is consulted, so nothing about others is revealed.
   */
  async assertInvitable(
    tx: Prisma.TransactionClient,
    organisationId: string,
    email: string,
    options: { allowActive?: boolean } = {},
  ): Promise<void> {
    const membership = await tx.membership.findFirst({
      where: { organisationId, user: { email } },
      select: { status: true },
    });
    if (membership?.status === 'ACTIVE' && !options.allowActive) {
      throw new AppError(409, CODES.ALREADY_MEMBER, 'This person is already a member');
    }
    if (membership?.status === 'SUSPENDED') {
      throw new AppError(
        409,
        CODES.MEMBER_SUSPENDED,
        'This person is a suspended member. Reinstate them instead of inviting them again.',
      );
    }
  }

  /**
   * Revokes a pending invitation inside the caller's transaction (organisation, if any,
   * already locked). 409 when it is no longer pending or has expired. `reason` marks an
   * automatic revocation in the audit log.
   */
  async revokeInTx(
    tx: Prisma.TransactionClient,
    invitation: Invitation,
    actor: InvitationActor,
    reason?: AutomaticRevocation,
  ): Promise<void> {
    await lockInvitation(tx, invitation.id);
    const now = new Date();
    const current = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assertPending(current, now);
    const updated = await tx.invitation.updateMany({
      where: { id: current.id, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'REVOKED', revokedById: actor.userId, revokedAt: now },
    });
    if (updated.count !== 1) throw changedMeanwhile();
    await cancelQueuedEmails(tx, { invitationId: current.id }, 'The invitation was revoked');
    await recordAudit(tx, {
      organisationId: current.organisationId,
      actorUserId: actor.userId,
      action: 'invitation.revoked',
      entityType: 'Invitation',
      entityId: current.id,
      metadata: {
        kind: current.kind,
        email: current.email,
        roles: current.roles,
        ...(reason ? { reason, invitedById: current.invitedById } : {}),
      },
      ipAddress: actor.ipAddress,
    });
  }

  /**
   * Revokes, in the caller's transaction, every valid (PENDING, not expired) invitation
   * matching `where` that `inviterId` issued, because the inviter lost the authority to
   * issue it. Each is audited as `invitation.revoked` with the reason, and its queued
   * email is cancelled. The organisations involved must already be locked. Returns the
   * number revoked.
   */
  async revokeIssuedBy(
    tx: Prisma.TransactionClient,
    inviterId: string,
    where: Prisma.InvitationWhereInput,
    actor: InvitationActor,
    reason: AutomaticRevocation,
  ): Promise<number> {
    const pending = await tx.invitation.findMany({
      where: { ...where, invitedById: inviterId, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { id: 'asc' },
    });
    for (const invitation of pending) await this.revokeInTx(tx, invitation, actor, reason);
    return pending.length;
  }

  async getDto(db: Prisma.TransactionClient | PrismaClient, id: string): Promise<InvitationDto> {
    const row = await db.invitation.findUniqueOrThrow({ where: { id }, include });
    return toInvitationDto(row);
  }

  async listDtos(where: Prisma.InvitationWhereInput, take = 200): Promise<InvitationDto[]> {
    const rows = await this.prisma.invitation.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take,
    });
    const now = new Date();
    return rows.map((r) => toInvitationDto(r, now));
  }

  // ─── Organisation invitations (members:read / members:manage) ──────────────

  /** Pending invitations plus those answered, revoked or expired in the last 30 days. */
  listForOrganisation(organisationId: string): Promise<InvitationDto[]> {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 3_600_000);
    return this.listDtos({
      kind: 'ORGANISATION',
      organisationId,
      OR: [{ status: 'PENDING' }, { updatedAt: { gte: since } }],
    });
  }

  async createForOrganisation(
    caller: Caller,
    input: InvitationCreateInput,
  ): Promise<InvitationDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      await lockOrganisation(tx, caller.organisationId);
      const callerRoles = await currentManagerRoles(tx, caller.organisationId, caller.userId);
      if (
        input.roles.includes('ORGANISATION_OWNER') &&
        !callerRoles.includes('ORGANISATION_OWNER')
      ) {
        throw new AppError(403, CODES.OWNER_ONLY, 'Only an Owner can invite someone as an Owner');
      }
      const organisation = await tx.organisation.findUniqueOrThrow({
        where: { id: caller.organisationId },
        select: { id: true, name: true },
      });
      await this.assertInvitable(tx, organisation.id, input.email);
      return this.issue(tx, {
        kind: 'ORGANISATION',
        organisation,
        email: input.email,
        roles: input.roles,
        inviter: caller,
      });
    });
    return this.getDto(this.prisma, id);
  }

  async revokeForOrganisation(caller: Caller, invitationId: string): Promise<InvitationDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganisation(tx, caller.organisationId);
      await currentManagerRoles(tx, caller.organisationId, caller.userId);
      const invitation = await tx.invitation.findFirst({
        where: { id: invitationId, organisationId: caller.organisationId, kind: 'ORGANISATION' },
      });
      if (!invitation) throw notFound('Invitation not found');
      await this.revokeInTx(tx, invitation, caller);
    });
    return this.getDto(this.prisma, invitationId);
  }

  // ─── Public: lookup, accept, decline ───────────────────────────────────────

  async lookup(token: string): Promise<InvitationLookupDto> {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        invitedBy: { select: { name: true } },
        organisation: { select: { name: true } },
      },
    });
    if (!inv) throw notFound(INVALID_LINK);
    const account = await this.prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true },
    });
    return {
      kind: inv.kind,
      organisationId: inv.organisationId,
      organisationName: inv.organisation?.name ?? null,
      inviterName: inv.invitedBy.name,
      email: inv.email,
      roles: inv.roles,
      expiresAt: inv.expiresAt.toISOString(),
      status: effectiveStatus(inv),
      accountExists: account !== null,
    };
  }

  /**
   * The account email an accept request will check a password for, or null when it won't
   * (unknown token, no account for the email, or signed in as that account). Used to apply
   * the per-account sign-in limits to that password check.
   */
  async passwordAttemptEmail(token: string, sessionUserId: string | null): Promise<string | null> {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { email: true },
    });
    if (!inv) return null;
    const account = await this.prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true },
    });
    return account && account.id !== sessionUserId ? inv.email : null;
  }

  /**
   * Accepts an invitation (ARCHITECTURAL_WORKFLOW.md §7.2):
   * - No account for the invited email: name and password are required; the account is
   *   created and a session opened.
   * - An account exists and the request is signed in as it: accepted for that session.
   * - An account exists and its password is given: verified here like a sign-in; a
   *   disabled account is re-enabled; a new session is opened. This is how someone whose
   *   account was disabled (removed from their last organisation) comes back.
   * - Otherwise 403: sign in as the invited email (or give its password).
   */
  async accept(
    input: InvitationAcceptInput,
    session: AcceptSession | null,
    ipAddress: string | null,
  ): Promise<AcceptResult> {
    const tokenHash = hashToken(input.token);
    const found = await this.prisma.invitation.findUnique({ where: { tokenHash } });
    if (!found) throw notFound(INVALID_LINK);
    assertPending(found, new Date());

    const account = await this.prisma.user.findUnique({
      where: { email: found.email },
      select: { id: true, passwordHash: true },
    });

    let mode: 'session' | 'password' | 'new';
    let newAccount: { name: string; passwordHash: string } | null = null;
    let liveSessionId: string | null = null;
    if (account && session?.userId === account.id) {
      mode = 'session';
      liveSessionId = session.sessionId;
    } else if (account && input.password !== undefined) {
      if (!(await verifyPassword(account.passwordHash, input.password))) {
        await recordAudit(this.prisma, {
          actorUserId: null,
          action: 'auth.login_failed',
          entityType: 'User',
          entityId: account.id,
          metadata: { reason: 'bad_password', via: 'invitation', invitationId: found.id },
          ipAddress,
        });
        throw unauthorized('Incorrect password for this account');
      }
      mode = 'password';
    } else if (account && session) {
      throw new AppError(
        403,
        CODES.INVITATION_WRONG_ACCOUNT,
        `This invitation is for ${found.email}. Sign in as ${found.email} to accept it.`,
      );
    } else if (account) {
      throw new AppError(
        403,
        CODES.INVITATION_SIGN_IN_REQUIRED,
        `An account already exists for ${found.email}. Sign in as ${found.email}, or enter its password, to accept.`,
      );
    } else {
      const errors: Record<string, string[]> = {};
      const { name, password } = input;
      if (name === undefined) errors['name'] = ['Enter your name'];
      if (password === undefined || password.length < NEW_PASSWORD_MIN) {
        errors['password'] = [
          `Choose a password of at least ${String(NEW_PASSWORD_MIN)} characters`,
        ];
      }
      if (name === undefined || password === undefined || Object.keys(errors).length > 0) {
        throw fieldErrors(errors);
      }
      // Hashing is slow; do it before taking any locks.
      newAccount = { name, passwordHash: await hashPassword(password) };
      mode = 'new';
    }

    const userId = await this.prisma.$transaction(async (tx) => {
      // Lock order: organisation, invitation, user.
      if (found.organisationId) await lockOrganisation(tx, found.organisationId);
      await lockInvitation(tx, found.id);
      const now = new Date();
      const inv = await tx.invitation.findUniqueOrThrow({ where: { id: found.id } });
      assertPending(inv, now);

      let id: string;
      if (newAccount) {
        try {
          const created = await tx.user.create({
            data: { email: inv.email, ...newAccount },
            select: { id: true },
          });
          id = created.id;
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw conflict('An account was just created for this email. Sign in to accept.');
          }
          throw err;
        }
        await recordAudit(tx, {
          organisationId: inv.organisationId,
          actorUserId: id,
          action: 'user.created',
          entityType: 'User',
          entityId: id,
          metadata: { via: 'invitation', invitationId: inv.id },
          ipAddress,
        });
      } else if (account) {
        id = account.id;
        await lockUser(tx, id);
        const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { status: true } });
        if (liveSessionId !== null) {
          // Only the password path re-enables an account. A signed-in request must still
          // have a live session of an active account.
          const live = await tx.session.findFirst({
            where: { id: liveSessionId, userId: id, revokedAt: null, expiresAt: { gt: now } },
            select: { id: true },
          });
          if (user.status !== 'ACTIVE' || !live) {
            throw unauthorized('Your session has ended. Sign in again to accept the invitation.');
          }
        } else if (user.status === 'DISABLED') {
          await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } });
          await recordAudit(tx, {
            organisationId: inv.organisationId,
            actorUserId: id,
            action: 'user.reenabled',
            entityType: 'User',
            entityId: id,
            metadata: { via: 'invitation', invitationId: inv.id },
            ipAddress,
          });
        }
      } else {
        throw new Error('Invitation acceptance without an account or account details');
      }

      if (inv.kind === 'ORGANISATION') {
        await this.joinOrganisation(tx, inv, id, ipAddress);
      } else {
        await this.grantPlatformAdmin(tx, inv, id, ipAddress);
      }

      const accepted = await tx.invitation.updateMany({
        where: { id: inv.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'ACCEPTED', acceptedById: id, respondedAt: now },
      });
      if (accepted.count !== 1) throw changedMeanwhile();
      await cancelQueuedEmails(tx, { invitationId: inv.id }, 'The invitation was accepted');
      await recordAudit(tx, {
        organisationId: inv.organisationId,
        actorUserId: id,
        action: 'invitation.accepted',
        entityType: 'Invitation',
        entityId: inv.id,
        metadata: { kind: inv.kind, roles: inv.roles, mode },
        ipAddress,
      });
      return id;
    });

    return { userId, openSession: mode !== 'session' };
  }

  async decline(
    token: string,
    actorUserId: string | null,
    ipAddress: string | null,
  ): Promise<InvitationLookupDto> {
    const found = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!found) throw notFound(INVALID_LINK);
    await this.prisma.$transaction(async (tx) => {
      await lockInvitation(tx, found.id);
      const now = new Date();
      const inv = await tx.invitation.findUniqueOrThrow({ where: { id: found.id } });
      assertPending(inv, now);
      const declined = await tx.invitation.updateMany({
        where: { id: inv.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'DECLINED', respondedAt: now },
      });
      if (declined.count !== 1) throw changedMeanwhile();
      await cancelQueuedEmails(tx, { invitationId: inv.id }, 'The invitation was declined');
      await recordAudit(tx, {
        organisationId: inv.organisationId,
        actorUserId,
        action: 'invitation.declined',
        entityType: 'Invitation',
        entityId: inv.id,
        metadata: { kind: inv.kind },
        ipAddress,
      });
    });
    return this.lookup(token);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Adds the user to the organisation, or reactivates their REMOVED membership (the same
   * row, given the unique (user, organisation) pair) with the invited roles.
   */
  private async joinOrganisation(
    tx: Prisma.TransactionClient,
    inv: Invitation,
    userId: string,
    ipAddress: string | null,
  ): Promise<void> {
    const organisationId = inv.organisationId;
    if (!organisationId) throw new Error('Organisation invitation without an organisation');
    const organisation = await tx.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { status: true },
    });
    if (organisation.status !== 'ACTIVE') {
      throw conflict('This organisation is not active, so the invitation cannot be accepted');
    }
    // A Platform Administrator's Owner invitation only revives a dormant organisation
    // (the organisation is locked, so this can't race a reinstated Owner).
    if (inv.issuedByPlatform && !(await isDormant(tx, organisationId))) {
      throw new AppError(
        409,
        CODES.ORGANISATION_NOT_DORMANT,
        'This organisation has an active Owner again, so this invitation can no longer be accepted. Ask its Owner for an invitation instead.',
      );
    }
    const existing = await tx.membership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    });
    if (existing?.status === 'ACTIVE' && inv.issuedByPlatform) {
      // An active member reviving a dormant organisation keeps their roles and gains Owner.
      const roles = normaliseRoles([...existing.roles, ...inv.roles]);
      await tx.membership.update({ where: { id: existing.id }, data: { roles } });
      await recordAudit(tx, {
        organisationId,
        actorUserId: userId,
        action: 'membership.roles_changed',
        entityType: 'Membership',
        entityId: existing.id,
        metadata: {
          userId,
          fromRoles: existing.roles,
          toRoles: roles,
          via: 'invitation',
          invitationId: inv.id,
        },
        ipAddress,
      });
      return;
    }
    if (existing?.status === 'ACTIVE') {
      throw new AppError(
        409,
        CODES.ALREADY_MEMBER,
        'You are already a member of this organisation',
      );
    }
    if (existing?.status === 'SUSPENDED') {
      throw new AppError(
        409,
        CODES.MEMBER_SUSPENDED,
        'Your membership of this organisation is suspended. Ask an administrator to reinstate it.',
      );
    }
    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', roles: inv.roles },
        })
      : await tx.membership.create({ data: { userId, organisationId, roles: inv.roles } });
    await recordAudit(tx, {
      organisationId,
      actorUserId: userId,
      action: existing ? 'membership.reactivated' : 'membership.created',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: {
        roles: inv.roles,
        invitationId: inv.id,
        ...(existing ? { previousStatus: existing.status, previousRoles: existing.roles } : {}),
      },
      ipAddress,
    });
  }

  private async grantPlatformAdmin(
    tx: Prisma.TransactionClient,
    inv: Invitation,
    userId: string,
    ipAddress: string | null,
  ): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    });
    if (user.isPlatformAdmin) return;
    await tx.user.update({ where: { id: userId }, data: { isPlatformAdmin: true } });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'platform_admin.granted',
      entityType: 'User',
      entityId: userId,
      metadata: { invitationId: inv.id, invitedById: inv.invitedById },
      ipAddress,
    });
  }
}

function pendingExists(): AppError {
  return new AppError(
    409,
    CODES.INVITATION_PENDING,
    'A valid invitation has already been sent to this email. Revoke it first to send a new one.',
  );
}

/** The row is locked and was checked, so this means a concurrent change slipped through. */
function changedMeanwhile(): AppError {
  return conflict('This invitation changed while you were answering it. Reload and try again.');
}
