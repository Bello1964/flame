import {
  COMPOSITION_TOTAL_TOLERANCE,
  GAS_COMPONENTS,
  type FlareEfficiencyDto,
  type GasComponent,
  type GasCompositionDto,
} from '@flame/shared';
import {
  Prisma,
  type FlareEfficiency,
  type GasComposition,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { recordAudit, type Db } from '../audit/audit.service.js';
import { dateOf, isoDateOf } from '../activity/activity.repository.js';
import type { Actor } from '../facilities/facilities.service.js';
import { lockFlareSource } from '../facilities/facilities.repository.js';
import type { CompositionCreate, EfficiencyCreate } from './calculations.schemas.js';

function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

type WithCreator<T> = T & {
  createdBy: { id: string; name: string };
  _count: { calculations: number };
};

const withCreator = {
  createdBy: { select: { id: true, name: true } },
  _count: { select: { calculations: true } },
} as const;

function withdrawalOf(r: {
  withdrawnAt: Date | null;
  withdrawnById: string | null;
  withdrawalReason: string | null;
}) {
  return r.withdrawnAt && r.withdrawnById && r.withdrawalReason
    ? { at: r.withdrawnAt.toISOString(), byId: r.withdrawnById, reason: r.withdrawalReason }
    : null;
}

export function componentsOf(c: GasComposition): Record<GasComponent, string> {
  return Object.fromEntries(GAS_COMPONENTS.map((k) => [k, exact(c[k])])) as Record<
    GasComponent,
    string
  >;
}

function totalOf(values: Record<GasComponent, string>): Prisma.Decimal {
  return GAS_COMPONENTS.reduce((sum, k) => sum.plus(values[k]), new Prisma.Decimal(0));
}

export function toCompositionDto(c: WithCreator<GasComposition>): GasCompositionDto {
  const components = componentsOf(c);
  return {
    id: c.id,
    flareSourceId: c.flareSourceId,
    validFrom: isoDateOf(c.validFrom),
    sampleDate: isoDateOf(c.sampleDate),
    sampleReference: c.sampleReference,
    analysisMethod: c.analysisMethod,
    components,
    hexanesPlusCarbonNumber: c.hexanesPlusCarbonNumber ? exact(c.hexanesPlusCarbonNumber) : null,
    total: totalOf(components).toFixed(),
    notes: c.notes,
    status: c.status,
    withdrawal: withdrawalOf(c),
    usedByCalculations: c._count.calculations > 0,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toEfficiencyDto(e: WithCreator<FlareEfficiency>): FlareEfficiencyDto {
  return {
    id: e.id,
    flareSourceId: e.flareSourceId,
    validFrom: isoDateOf(e.validFrom),
    basis: e.basis,
    combustionEfficiencyPercent: exact(e.combustionEfficiencyPercent),
    uncombustedMethanePercent: e.uncombustedMethanePercent
      ? exact(e.uncombustedMethanePercent)
      : null,
    sourceReference: e.sourceReference,
    testDate: e.testDate ? isoDateOf(e.testDate) : null,
    notes: e.notes,
    status: e.status,
    withdrawal: withdrawalOf(e),
    usedByCalculations: e._count.calculations > 0,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * The analysis or efficiency record that applies to a whole period: the latest active one
 * valid from on or before the start, provided no other active one starts inside the
 * period (then the period spans two, and the calculation is refused rather than guessed).
 */
export async function coveringRecord<T extends { validFrom: Date }>(
  find: (where: { validFrom: { lte: Date } | { gt: Date; lte: Date } }) => Promise<T[]>,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ record: T | null; spansChange: boolean }> {
  const [before, inside] = await Promise.all([
    find({ validFrom: { lte: periodStart } }),
    find({ validFrom: { gt: periodStart, lte: periodEnd } }),
  ]);
  return { record: before[0] ?? null, spansChange: inside.length > 0 };
}

/**
 * Gas analyses and flare efficiency evidence per flare source (ARCHITECTURAL_WORKFLOW.md
 * §8.1). Records are never edited; a correction is a new record, and a mistaken one is
 * withdrawn with a reason. Calculations keep a snapshot of what they used.
 */
export class InputsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCompositions(organisationId: string, flareSourceId: string) {
    await this.sourceOrThrow(this.prisma, organisationId, flareSourceId);
    const rows = await this.prisma.gasComposition.findMany({
      where: { organisationId, flareSourceId },
      include: withCreator,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toCompositionDto);
  }

  async createComposition(actor: Actor, flareSourceId: string, input: CompositionCreate) {
    const total = totalOf(input.components);
    const tolerance = new Prisma.Decimal(COMPOSITION_TOTAL_TOLERANCE);
    if (total.minus(100).abs().gt(tolerance)) {
      throw fieldError(
        'components',
        `The components total ${total.toFixed()}%; they must total 100% within ±${COMPOSITION_TOTAL_TOLERANCE}% (values are never rescaled)`,
      );
    }
    const id = await this.prisma.$transaction(async (tx) => {
      await this.activeSourceOrThrow(tx, actor.organisationId, flareSourceId);
      const row = await tx.gasComposition.create({
        data: {
          organisationId: actor.organisationId,
          flareSourceId,
          validFrom: dateOf(input.validFrom),
          sampleDate: dateOf(input.sampleDate),
          sampleReference: input.sampleReference,
          analysisMethod: input.analysisMethod ?? null,
          ...input.components,
          hexanesPlusCarbonNumber:
            Number(input.components.hexanesPlus) > 0
              ? (input.hexanesPlusCarbonNumber ?? null)
              : null,
          entered: {
            components: input.components,
            hexanesPlusCarbonNumber: input.hexanesPlusCarbonNumber ?? null,
          },
          notes: input.notes ?? null,
          createdById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'gas_composition.created', 'GasComposition', row.id, {
        flareSourceId,
        validFrom: input.validFrom,
        components: input.components,
      });
      return row.id;
    });
    return this.getComposition(actor.organisationId, id);
  }

  async withdrawComposition(actor: Actor, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM gas_compositions WHERE id = ${id}::uuid AND "organisationId" = ${actor.organisationId}::uuid FOR UPDATE`;
      const row = await tx.gasComposition.findFirst({
        where: { id, organisationId: actor.organisationId },
      });
      if (!row) throw notFound('Gas analysis not found');
      if (row.status !== 'ACTIVE') throw conflict('This gas analysis is already withdrawn');
      await tx.gasComposition.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawnById: actor.userId,
          withdrawalReason: reason,
        },
      });
      await this.audit(tx, actor, 'gas_composition.withdrawn', 'GasComposition', id, { reason });
    });
    return this.getComposition(actor.organisationId, id);
  }

  async listEfficiencies(organisationId: string, flareSourceId: string) {
    await this.sourceOrThrow(this.prisma, organisationId, flareSourceId);
    const rows = await this.prisma.flareEfficiency.findMany({
      where: { organisationId, flareSourceId },
      include: withCreator,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toEfficiencyDto);
  }

  async createEfficiency(actor: Actor, flareSourceId: string, input: EfficiencyCreate) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.activeSourceOrThrow(tx, actor.organisationId, flareSourceId);
      const row = await tx.flareEfficiency.create({
        data: {
          organisationId: actor.organisationId,
          flareSourceId,
          validFrom: dateOf(input.validFrom),
          basis: input.basis,
          combustionEfficiencyPercent: input.combustionEfficiencyPercent,
          uncombustedMethanePercent: input.uncombustedMethanePercent ?? null,
          sourceReference: input.sourceReference,
          testDate: input.testDate ? dateOf(input.testDate) : null,
          entered: {
            combustionEfficiencyPercent: input.combustionEfficiencyPercent,
            uncombustedMethanePercent: input.uncombustedMethanePercent ?? null,
          },
          notes: input.notes ?? null,
          createdById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'flare_efficiency.created', 'FlareEfficiency', row.id, {
        flareSourceId,
        basis: input.basis,
        validFrom: input.validFrom,
        combustionEfficiencyPercent: input.combustionEfficiencyPercent,
        uncombustedMethanePercent: input.uncombustedMethanePercent ?? null,
      });
      return row.id;
    });
    return this.getEfficiency(actor.organisationId, id);
  }

  async withdrawEfficiency(actor: Actor, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM flare_efficiencies WHERE id = ${id}::uuid AND "organisationId" = ${actor.organisationId}::uuid FOR UPDATE`;
      const row = await tx.flareEfficiency.findFirst({
        where: { id, organisationId: actor.organisationId },
      });
      if (!row) throw notFound('Flare efficiency record not found');
      if (row.status !== 'ACTIVE')
        throw conflict('This flare efficiency record is already withdrawn');
      await tx.flareEfficiency.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawnById: actor.userId,
          withdrawalReason: reason,
        },
      });
      await this.audit(tx, actor, 'flare_efficiency.withdrawn', 'FlareEfficiency', id, { reason });
    });
    return this.getEfficiency(actor.organisationId, id);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async getComposition(organisationId: string, id: string) {
    const row = await this.prisma.gasComposition.findFirst({
      where: { id, organisationId },
      include: withCreator,
    });
    if (!row) throw notFound('Gas analysis not found');
    return toCompositionDto(row);
  }

  private async getEfficiency(organisationId: string, id: string) {
    const row = await this.prisma.flareEfficiency.findFirst({
      where: { id, organisationId },
      include: withCreator,
    });
    if (!row) throw notFound('Flare efficiency record not found');
    return toEfficiencyDto(row);
  }

  private async sourceOrThrow(db: Db, organisationId: string, flareSourceId: string) {
    const source = await db.flareSource.findFirst({
      where: { id: flareSourceId, organisationId },
      select: { id: true, status: true },
    });
    // Another organisation's flare source is indistinguishable from a missing one.
    if (!source) throw notFound('Flare source not found');
    return source;
  }

  private async activeSourceOrThrow(
    tx: Prisma.TransactionClient,
    organisationId: string,
    flareSourceId: string,
  ) {
    await lockFlareSource(tx, organisationId, flareSourceId);
    const source = await this.sourceOrThrow(tx, organisationId, flareSourceId);
    if (source.status !== 'ACTIVE') {
      throw conflict('The flare source is archived, so no new records can be added to it');
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: actor.ipAddress,
    });
  }
}
