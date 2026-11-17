import {
  MEMBERSHIP_ERROR_CODES as CODES,
  type InvitationDto,
  type PlatformAdminDto,
  type PlatformAdminRemovalDto,
  type PlatformAdminsDto,
  type PlatformOrganisationDto,
} from '@flame/shared';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { disableIfUnattached, lockUser } from '../auth/accounts.js';
import type { InvitationsService } from '../organisations/invitations.service.js';
import { lockOrganisation } from '../organisations/locks.js';
import type { OrganisationCreateInput } from './platform-admin.schemas.js';

/** A signed-in Platform Administrator acting at platform level. */
export interface PlatformActor {
  userId: string;
  ipAddress: string | null;
}

const SLUG_MAX = 90;
const SLUG_ATTEMPTS = 5;

/** URL-safe slug from an organisation name: lower-case ASCII letters, digits and hyphens. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug || 'organisation';
}

/** The base slug, or base-2, base-3, … when taken. */
async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const taken = new Set(
    (
      await tx.organisation.findMany({
        where: { slug: { startsWith: base } },
        select: { slug: true },
      })
    ).map((o) => o.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Platform-level administration (ARCHITECTURAL_WORKFLOW.md §7.2): organisations, their
 * first Owner invitation, and Platform Administrators. Grants no access to any
 * organisation's data: an administrator who creates an organisation does not become a
 * member, and sees only counts and the bootstrap Owner invitation.
 */
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly invitations: InvitationsService,
  ) {}

  // ─── Organisations ─────────────────────────────────────────────────────────

  async listOrganisations(
    where: Prisma.OrganisationWhereInput = {},
  ): Promise<PlatformOrganisationDto[]> {
    const orgs = await this.prisma.organisation.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        status: true,
        createdAt: true,
      },
    });
    const ids = orgs.map((o) => o.id);
    const [active, owners] = await Promise.all([
      this.prisma.membership.groupBy({
        by: ['organisationId'],
        where: { organisationId: { in: ids }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.membership.groupBy({
        by: ['organisationId'],
        where: {
          organisationId: { in: ids },
          status: 'ACTIVE',
          roles: { has: 'ORGANISATION_OWNER' },
        },
        _count: { _all: true },
      }),
    ]);
    const activeCount = new Map(active.map((g) => [g.organisationId, g._count._all]));
    const ownerCount = new Map(owners.map((g) => [g.organisationId, g._count._all]));
    // Only the Owner invitation of dormant organisations (no active Owner).
    const withoutOwner = ids.filter((id) => !ownerCount.get(id));
    const pending =
      withoutOwner.length === 0
        ? []
        : await this.invitations.listDtos({
            kind: 'ORGANISATION',
            organisationId: { in: withoutOwner },
            status: 'PENDING',
            expiresAt: { gt: new Date() },
            roles: { has: 'ORGANISATION_OWNER' },
          });
    const pendingByOrg = new Map<string, InvitationDto>();
    for (const inv of pending) {
      if (inv.organisationId && !pendingByOrg.has(inv.organisationId)) {
        pendingByOrg.set(inv.organisationId, inv);
      }
    }
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      country: o.country,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      activeMemberCount: activeCount.get(o.id) ?? 0,
      hasActiveOwner: (ownerCount.get(o.id) ?? 0) > 0,
      dormant: (ownerCount.get(o.id) ?? 0) === 0,
      pendingOwnerInvitation: pendingByOrg.get(o.id) ?? null,
    }));
  }

  /**
   * Creates an organisation and invites its first Owner, in one transaction. The slug
   * comes from the name, suffixed (-2, -3, …) when taken; a clash with a concurrent
   * creation is retried.
   */
  async createOrganisation(
    actor: PlatformActor,
    input: OrganisationCreateInput,
  ): Promise<PlatformOrganisationDto> {
    const base = slugify(input.name);
    for (let attempt = 1; ; attempt++) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const slug = await uniqueSlug(tx, base);
          const organisation = await tx.organisation.create({
            data: { name: input.name, slug, country: input.country },
            select: { id: true, name: true, slug: true, country: true },
          });
          await recordAudit(tx, {
            organisationId: organisation.id,
            actorUserId: actor.userId,
            action: 'organisation.created',
            entityType: 'Organisation',
            entityId: organisation.id,
            metadata: { name: organisation.name, slug, country: organisation.country },
            ipAddress: actor.ipAddress,
          });
          await this.invitations.issue(tx, {
            kind: 'ORGANISATION',
            organisation,
            email: input.ownerEmail,
            roles: ['ORGANISATION_OWNER'],
            inviter: actor,
            issuedByPlatform: true,
          });
          return organisation.id;
        });
        return await this.organisation(id);
      } catch (err) {
        if (isUniqueViolation(err) && attempt < SLUG_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  /**
   * Invites an Owner to a dormant organisation (no active Owner): the first Owner of a new
   * organisation, or a new Owner reviving one. It may go to an active member, who keeps
   * their roles and gains Owner; a suspended member must be reinstated first. The
   * invitation can be accepted only while the organisation is still dormant.
   */
  async inviteOwner(
    actor: PlatformActor,
    organisationId: string,
    email: string,
  ): Promise<InvitationDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      await lockOrganisation(tx, organisationId);
      const organisation = await tx.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true, name: true },
      });
      if (!organisation) throw notFound('Organisation not found');
      if (await this.hasActiveOwner(tx, organisationId)) {
        throw new AppError(
          409,
          CODES.ORGANISATION_HAS_OWNER,
          'This organisation already has an active Owner, who manages its members',
        );
      }
      // One bootstrap Owner invitation at a time: revoke it to re-issue (to any email).
      const now = new Date();
      const ownerInvitations = {
        kind: 'ORGANISATION' as const,
        organisationId,
        status: 'PENDING' as const,
        roles: { has: 'ORGANISATION_OWNER' as const },
      };
      await tx.invitation.updateMany({
        where: { ...ownerInvitations, expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      if (await tx.invitation.findFirst({ where: ownerInvitations, select: { id: true } })) {
        throw new AppError(
          409,
          CODES.INVITATION_PENDING,
          'This organisation already has a valid Owner invitation. Revoke it first to send a new one.',
        );
      }
      await this.invitations.assertInvitable(tx, organisationId, email, { allowActive: true });
      return this.invitations.issue(tx, {
        kind: 'ORGANISATION',
        organisation,
        email,
        roles: ['ORGANISATION_OWNER'],
        inviter: actor,
        issuedByPlatform: true,
      });
    });
    return this.invitations.getDto(this.prisma, id);
  }

  /**
   * Revokes a Platform Administrator invitation, an Owner invitation issued by the
   * platform, or any Owner invitation of a dormant organisation. Any other invitation is
   * the organisation's own business: 404.
   */
  async revokeInvitation(actor: PlatformActor, invitationId: string): Promise<InvitationDto> {
    const found = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!found) throw notFound('Invitation not found');
    await this.prisma.$transaction(async (tx) => {
      if (found.organisationId) {
        await lockOrganisation(tx, found.organisationId);
        if (
          !found.issuedByPlatform &&
          (!found.roles.includes('ORGANISATION_OWNER') ||
            (await this.hasActiveOwner(tx, found.organisationId)))
        ) {
          throw notFound('Invitation not found');
        }
      }
      await this.invitations.revokeInTx(tx, found, actor);
    });
    return this.invitations.getDto(this.prisma, invitationId);
  }

  // ─── Platform Administrators ───────────────────────────────────────────────

  async listPlatformAdmins(viewerId: string): Promise<PlatformAdminsDto> {
    const [admins, viewer, invitations] = await Promise.all([
      this.prisma.user.findMany({
        where: { isPlatformAdmin: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          isSupremeAdmin: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: viewerId },
        select: { isSupremeAdmin: true },
      }),
      this.invitations.listDtos({
        kind: 'PLATFORM_ADMIN',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      }),
    ]);
    const administrators: PlatformAdminDto[] = admins.map((a) => ({
      userId: a.id,
      name: a.name,
      email: a.email,
      isSupremeAdmin: a.isSupremeAdmin,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    }));
    return { administrators, invitations, viewerIsSupremeAdmin: viewer.isSupremeAdmin };
  }

  /** Any Platform Administrator may invite another. */
  async invitePlatformAdmin(actor: PlatformActor, email: string): Promise<InvitationDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { isPlatformAdmin: true },
      });
      if (existing?.isPlatformAdmin) {
        throw new AppError(
          409,
          CODES.ALREADY_PLATFORM_ADMIN,
          'This person is already a Platform Administrator',
        );
      }
      return this.invitations.issue(tx, {
        kind: 'PLATFORM_ADMIN',
        organisation: null,
        email,
        roles: [],
        inviter: actor,
      });
    });
    return this.invitations.getDto(this.prisma, id);
  }

  /**
   * Only the supreme administrator removes administration rights, and they can't be
   * removed themselves. In the same transaction, the administrator's valid Platform
   * Administrator invitations and platform Owner invitations are revoked (they can no
   * longer issue them), and a removed administrator with no ACTIVE or SUSPENDED membership
   * is disabled and signed out everywhere.
   */
  async removePlatformAdmin(
    actor: PlatformActor,
    userId: string,
  ): Promise<PlatformAdminRemovalDto> {
    return this.prisma.$transaction(async (tx) => {
      const viewer = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { isSupremeAdmin: true },
      });
      if (!viewer.isSupremeAdmin) {
        throw new AppError(
          403,
          CODES.SUPREME_ADMIN_REQUIRED,
          'Only the supreme Platform Administrator can remove administration rights',
        );
      }
      const assertRemovable = async () => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { isPlatformAdmin: true, isSupremeAdmin: true },
        });
        if (!target?.isPlatformAdmin) throw notFound('Platform Administrator not found');
        if (target.isSupremeAdmin) {
          throw new AppError(
            409,
            CODES.SUPREME_ADMIN_PROTECTED,
            'The supreme Platform Administrator cannot be removed. Transfer the role first.',
          );
        }
      };
      await assertRemovable();

      // Lock order: organisations, invitations, then the user.
      const revival = await tx.invitation.findMany({
        where: { invitedById: userId, issuedByPlatform: true, status: 'PENDING' },
        select: { organisationId: true },
      });
      const organisations = [...new Set(revival.map((i) => i.organisationId))]
        .filter((id): id is string => id !== null)
        .sort();
      for (const organisationId of organisations) await lockOrganisation(tx, organisationId);
      const revokedInvitations =
        (await this.invitations.revokeIssuedBy(
          tx,
          userId,
          { kind: 'PLATFORM_ADMIN' },
          actor,
          'inviter_lost_platform_admin',
        )) +
        (await this.invitations.revokeIssuedBy(
          tx,
          userId,
          { kind: 'ORGANISATION', issuedByPlatform: true, organisationId: { in: organisations } },
          actor,
          'inviter_lost_platform_admin',
        ));

      await lockUser(tx, userId);
      await assertRemovable();
      await tx.user.update({ where: { id: userId }, data: { isPlatformAdmin: false } });
      await recordAudit(tx, {
        actorUserId: actor.userId,
        action: 'platform_admin.removed',
        entityType: 'User',
        entityId: userId,
        metadata: { revokedInvitations },
        ipAddress: actor.ipAddress,
      });
      const accountDisabled = await disableIfUnattached(
        tx,
        userId,
        actor,
        'platform_admin_removed',
        null,
      );
      return { userId, accountDisabled };
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async organisation(id: string): Promise<PlatformOrganisationDto> {
    const [org] = await this.listOrganisations({ id });
    if (!org) throw notFound('Organisation not found');
    return org;
  }

  private async hasActiveOwner(tx: Prisma.TransactionClient, organisationId: string) {
    const owners = await tx.membership.count({
      where: { organisationId, status: 'ACTIVE', roles: { has: 'ORGANISATION_OWNER' } },
    });
    return owners > 0;
  }
}
