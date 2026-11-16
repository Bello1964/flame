import type {
  MethodologyContent,
  MethodologyEditionDto,
  MethodologyEditionSummaryDto,
  MethodologyParameterDto,
} from '@flame/shared';
import { CALCULATION_ROUTES } from '@flame/shared';
import type {
  MethodologyEdition,
  MethodologyParameter,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { recordAudit, type Db } from '../audit/audit.service.js';
import { requiredParameters } from '../calculations/engine.js';
import type { EditionUpdate, ParameterUpdate } from './methodology.schemas.js';

/** The methodology Flame calculates with. One code for now; editions are numbered. */
export const METHODOLOGY_CODE = 'flame-flaring-venting';

/** Readable without signing in: approved and superseded (historical) editions. */
const PUBLISHED = ['APPROVED', 'SUPERSEDED'] as const;

/** Audit actions that make a Platform Administrator an author of a draft. */
const AUTHOR_ACTIONS = [
  'methodology_edition.created',
  'methodology_edition.updated',
  'methodology_edition.parameter_updated',
];

const editionInclude = {
  parameters: { orderBy: { key: 'asc' } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.MethodologyEditionInclude;

type EditionWithRelations = Prisma.MethodologyEditionGetPayload<{
  include: typeof editionInclude;
}>;

export interface PlatformAdmin {
  userId: string;
  ipAddress: string | null;
}

function summary(e: MethodologyEdition): MethodologyEditionSummaryDto {
  return {
    id: e.id,
    code: e.code,
    edition: e.edition,
    title: e.title,
    summary: e.summary,
    status: e.status,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    supersededAt: e.supersededAt?.toISOString() ?? null,
  };
}

export function toParameterDto(p: MethodologyParameter): MethodologyParameterDto {
  return {
    key: p.key,
    kind: p.kind,
    name: p.name,
    value: exact(p.value),
    unit: p.unit,
    gas: p.gas,
    appliesTo: p.appliesTo,
    sourceOrganisation: p.sourceOrganisation,
    sourceDocument: p.sourceDocument,
    sourceEdition: p.sourceEdition,
    sourceLocation: p.sourceLocation,
    sourceUrl: p.sourceUrl,
    retrievedOn: p.retrievedOn.toISOString().slice(0, 10),
    notes: p.notes,
  };
}

/**
 * Every number the engine multiplies or divides by is a positive quantity, and a
 * percentage can't exceed 100. Returns why a value can't be used, or null.
 */
export function valueProblem(value: string, unit: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'must be greater than zero';
  if (unit.trim() === '%' && n > 100) return 'a percentage can be at most 100';
  return null;
}

/** The public view names no people: approval is shown by date only. */
function toPublicDto(e: EditionWithRelations): MethodologyEditionDto {
  return { ...toDto(e), createdBy: null, approvedBy: null };
}

function toDto(e: EditionWithRelations): MethodologyEditionDto {
  return {
    ...summary(e),
    content: e.content as unknown as MethodologyContent,
    parameters: e.parameters.map(toParameterDto),
    provenance: e.provenance,
    createdBy: e.createdBy,
    approvedBy: e.approvedBy,
    createdAt: e.createdAt.toISOString(),
    withdrawal:
      e.withdrawnAt && e.withdrawalReason
        ? { at: e.withdrawnAt.toISOString(), reason: e.withdrawalReason }
        : null,
  };
}

/**
 * The methodology registry (ARCHITECTURAL_WORKFLOW.md §8.1). Editions are shared
 * reference data, not tenant data: approved ones are public; Platform Administrators
 * draft and approve them, and an approved edition never changes.
 */
export class MethodologyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Public ────────────────────────────────────────────────────────────────

  async listPublished(): Promise<MethodologyEditionSummaryDto[]> {
    const editions = await this.prisma.methodologyEdition.findMany({
      where: { status: { in: [...PUBLISHED] } },
      orderBy: [{ code: 'asc' }, { edition: 'desc' }],
    });
    return editions.map(summary);
  }

  async getPublished(id: string): Promise<MethodologyEditionDto> {
    const e = await this.prisma.methodologyEdition.findFirst({
      where: { id, status: { in: [...PUBLISHED] } },
      include: editionInclude,
    });
    if (!e) throw notFound('Methodology edition not found');
    return toPublicDto(e);
  }

  /** The edition new calculations use: the approved one. */
  current(db: Db) {
    return db.methodologyEdition.findFirst({
      where: { code: METHODOLOGY_CODE, status: 'APPROVED' },
      include: { parameters: true },
    });
  }

  // ─── Platform Administrators ───────────────────────────────────────────────

  async listAll(): Promise<MethodologyEditionSummaryDto[]> {
    const editions = await this.prisma.methodologyEdition.findMany({
      orderBy: [{ code: 'asc' }, { edition: 'desc' }],
    });
    return editions.map(summary);
  }

  async getForAdmin(admin: PlatformAdmin, id: string): Promise<MethodologyEditionDto> {
    const e = await this.prisma.methodologyEdition.findUnique({
      where: { id },
      include: editionInclude,
    });
    if (!e) throw notFound('Methodology edition not found');
    const blocked = e.status === 'DRAFT' ? await this.approvalBlock(this.prisma, e, admin) : null;
    return {
      ...toDto(e),
      canApprove: e.status === 'DRAFT' && blocked === null,
      approvalBlockedReason: e.status === 'DRAFT' ? blocked : null,
    };
  }

  /** Starts a new draft edition from an approved or superseded one. */
  async draftFrom(admin: PlatformAdmin, sourceId: string): Promise<MethodologyEditionDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const source = await tx.methodologyEdition.findFirst({
        where: { id: sourceId, status: { in: [...PUBLISHED, 'WITHDRAWN'] } },
        include: { parameters: true },
      });
      if (!source) throw notFound('Methodology edition not found');
      // A withdrawn edition is a starting point only while nothing has ever been approved
      // (otherwise drafts start from the published editions).
      if (source.status === 'WITHDRAWN') {
        const published = await tx.methodologyEdition.count({
          where: { code: source.code, status: { in: [...PUBLISHED] } },
        });
        if (published > 0) {
          throw conflict('Start a draft from a published edition instead of a withdrawn one');
        }
      }
      const draft = await tx.methodologyEdition.findFirst({
        where: { code: source.code, status: 'DRAFT' },
        select: { id: true },
      });
      if (draft) throw conflict('A draft edition already exists; edit or withdraw it first');
      const latest = await tx.methodologyEdition.aggregate({
        where: { code: source.code },
        _max: { edition: true },
      });
      const created = await tx.methodologyEdition.create({
        data: {
          code: source.code,
          edition: (latest._max.edition ?? 0) + 1,
          title: source.title,
          summary: source.summary,
          content: source.content as Prisma.InputJsonValue,
          createdById: admin.userId,
          parameters: {
            create: source.parameters.map(({ id: _id, editionId: _e, ...p }) => p),
          },
        },
      });
      await this.audit(tx, admin, 'methodology_edition.created', created.id, {
        edition: created.edition,
        from: { id: source.id, edition: source.edition },
      });
      return created.id;
    });
    return this.getForAdmin(admin, id);
  }

  async update(admin: PlatformAdmin, id: string, input: EditionUpdate) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, id);
      await tx.methodologyEdition.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.content === undefined ? {} : { content: input.content }),
        },
      });
      await this.audit(tx, admin, 'methodology_edition.updated', id, {
        fields: Object.keys(input),
      });
    });
    return this.getForAdmin(admin, id);
  }

  async updateParameter(admin: PlatformAdmin, id: string, key: string, input: ParameterUpdate) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, id);
      const existing = await tx.methodologyParameter.findUnique({
        where: { editionId_key: { editionId: id, key } },
      });
      if (!existing) throw notFound('Parameter not found');
      const problem = valueProblem(
        input.value ?? exact(existing.value),
        input.unit ?? existing.unit,
      );
      if (problem) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
          formErrors: [],
          fieldErrors: { value: [problem] },
        });
      }
      const { retrievedOn, ...rest } = input;
      // Only the fields sent; an absent field leaves the stored value unchanged.
      const changed = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Prisma.MethodologyParameterUpdateInput;
      await tx.methodologyParameter.update({
        where: { id: existing.id },
        data: {
          ...changed,
          ...(retrievedOn === undefined
            ? {}
            : { retrievedOn: new Date(`${retrievedOn}T00:00:00Z`) }),
        },
      });
      await this.audit(tx, admin, 'methodology_edition.parameter_updated', id, {
        key,
        before: toParameterDto(existing) as unknown as Prisma.InputJsonValue,
        changes: input as unknown as Prisma.InputJsonValue,
      });
    });
    return this.getForAdmin(admin, id);
  }

  /**
   * Approves a draft. The approver must not have created or edited it (two people).
   * The previously approved edition becomes superseded but stays readable, and every
   * calculation keeps pointing at the edition it used.
   */
  async approve(admin: PlatformAdmin, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.lockDraft(tx, id);
      const blocked = await this.approvalBlock(tx, draft, admin);
      if (blocked) throw conflict(blocked);
      const keys = new Set(
        (
          await tx.methodologyParameter.findMany({
            where: { editionId: id },
            select: { key: true },
          })
        ).map((p) => p.key),
      );
      const missing = [...new Set(CALCULATION_ROUTES.flatMap(requiredParameters))].filter(
        (k) => !keys.has(k),
      );
      const invalid = (
        await tx.methodologyParameter.findMany({ where: { editionId: id } })
      ).flatMap((p) => {
        const problem = valueProblem(exact(p.value), p.unit);
        return problem ? [`${p.key}: ${problem}`] : [];
      });
      if (invalid.length > 0) {
        throw conflict(`Some values can't be used: ${invalid.join('; ')}`);
      }
      if (missing.length > 0) {
        throw conflict(
          `The edition is missing parameters the calculations need: ${missing.join(', ')}`,
        );
      }
      const now = new Date();
      const previous = await tx.methodologyEdition.findFirst({
        where: { code: draft.code, status: 'APPROVED' },
      });
      if (previous) {
        await tx.methodologyEdition.update({
          where: { id: previous.id },
          data: { status: 'SUPERSEDED', supersededAt: now },
        });
        await this.audit(tx, admin, 'methodology_edition.superseded', previous.id, {
          supersededBy: id,
        });
      }
      await tx.methodologyEdition.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: now, approvedById: admin.userId },
      });
      await this.audit(tx, admin, 'methodology_edition.approved', id, {
        edition: draft.edition,
        ...(previous ? { supersedes: previous.id } : {}),
      });
    });
    return this.getForAdmin(admin, id);
  }

  async withdraw(admin: PlatformAdmin, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, id);
      await tx.methodologyEdition.update({
        where: { id },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawalReason: reason },
      });
      await this.audit(tx, admin, 'methodology_edition.withdrawn', id, { reason });
    });
    return this.getForAdmin(admin, id);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Locks the edition row (serialising edits, approval and withdrawal); it must be a draft. */
  private async lockDraft(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM methodology_editions WHERE id = ${id}::uuid FOR UPDATE`;
    // Also serialise approvals of the same methodology (one approved edition at a time).
    const edition = await tx.methodologyEdition.findUnique({ where: { id } });
    if (!edition) throw notFound('Methodology edition not found');
    if (edition.status !== 'DRAFT') {
      throw conflict(`This edition is ${edition.status.toLowerCase()}; only drafts can change`);
    }
    await tx.$queryRaw`SELECT id FROM methodology_editions WHERE code = ${edition.code} AND status = 'APPROVED' FOR UPDATE`;
    return edition;
  }

  /** Why `admin` may not approve the draft, or null. */
  private async approvalBlock(
    db: Db,
    edition: MethodologyEdition,
    admin: PlatformAdmin,
  ): Promise<string | null> {
    if (edition.createdById === admin.userId) {
      return 'You created this draft, so another Platform Administrator must approve it';
    }
    const edited = await db.auditLog.findFirst({
      where: {
        entityType: 'MethodologyEdition',
        entityId: edition.id,
        actorUserId: admin.userId,
        action: { in: AUTHOR_ACTIONS },
      },
      select: { id: true },
    });
    return edited
      ? 'You edited this draft, so another Platform Administrator must approve it'
      : null;
  }

  private audit(
    tx: Prisma.TransactionClient,
    admin: PlatformAdmin,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: null,
      actorUserId: admin.userId,
      action,
      entityType: 'MethodologyEdition',
      entityId,
      metadata,
      ipAddress: admin.ipAddress,
    });
  }
}
