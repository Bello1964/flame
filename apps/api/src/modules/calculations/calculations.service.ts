import {
  CALCULATION_BLOCKED_CODE,
  CALCULATION_COMMENT_REQUIRED,
  SEPARATION_OF_DUTIES_CODE,
  type CalculationAction,
  type CalculationBlockedDetails,
  type CalculationDto,
  type CalculationEventDto,
  type CalculationStepDto,
} from '@flame/shared';
import type {
  ActivityType,
  CalculationEventType,
  CalculationStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { recordAudit, type Db } from '../audit/audit.service.js';
import { isoDateOf, lockRecord } from '../activity/activity.repository.js';
import type { Caller } from '../activity/activity.service.js';
import type { Actor } from '../facilities/facilities.service.js';
import type { MethodologyService } from '../methodology/methodology.service.js';
import { toParameterDto } from '../methodology/methodology.service.js';
import type { Refusal, Viewer } from '../workflow/workflow.rules.js';
import {
  calculationActions,
  calculationRefusal,
  calculationSeparationNote,
  type CalculationInvolvement,
} from './calculation.rules.js';
import type { CalculationListQuery, RunInput } from './calculations.schemas.js';
import { calculate, ENGINE_VERSION, EngineError, type EngineEfficiency } from './engine.js';
import { componentsOf, coveringRecord } from './inputs.service.js';

const FLARING: ActivityType[] = ['ROUTINE_FLARING', 'NON_ROUTINE_FLARING', 'EMERGENCY_FLARING'];
const OPEN: CalculationStatus[] = ['CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL'];

const include = {
  activityRecord: {
    select: {
      id: true,
      kind: true,
      activityType: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  },
  flareSource: {
    select: {
      id: true,
      name: true,
      code: true,
      asset: { select: { facility: { select: { name: true } } } },
    },
  },
  edition: { select: { id: true, code: true, edition: true, title: true, status: true } },
  createdBy: { select: { id: true, name: true } },
  claimedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} satisfies Prisma.CalculationInclude;

type CalculationRow = Prisma.CalculationGetPayload<{ include: typeof include }>;

interface Transition {
  to: CalculationStatus;
  event: CalculationEventType;
}

const TRANSITIONS: Record<CalculationAction, Transition> = {
  submit: { to: 'SUBMITTED', event: 'SUBMITTED' },
  recall: { to: 'CALCULATED', event: 'RECALLED' },
  discard: { to: 'DISCARDED', event: 'DISCARDED' },
  'start-review': { to: 'UNDER_REVIEW', event: 'REVIEW_STARTED' },
  'release-claim': { to: 'SUBMITTED', event: 'CLAIM_RELEASED' },
  forward: { to: 'AWAITING_APPROVAL', event: 'FORWARDED' },
  approve: { to: 'APPROVED', event: 'APPROVED' },
  reject: { to: 'REJECTED', event: 'REJECTED' },
};

function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

function refusalError(r: Refusal): AppError {
  if (r.kind === 'permission') return forbidden();
  if (r.kind === 'separation') return new AppError(403, SEPARATION_OF_DUTIES_CODE, r.message);
  return conflict(r.message);
}

function blocked(missing: string[]): AppError {
  const details: CalculationBlockedDetails = { missing };
  return new AppError(
    409,
    CALCULATION_BLOCKED_CODE,
    'This calculation can’t run until the inputs it needs are available',
    details,
  );
}

const ROUTE_LABEL = {
  COMPOSITION_FLARING: 'Flaring, measured gas composition',
  IPCC_REFERENCE_FLARING: 'Flaring, IPCC reference case',
  COMPOSITION_VENTING: 'Venting, measured gas composition',
} as const;

/**
 * Emissions calculations (ARCHITECTURAL_WORKFLOW.md §8.1). A calculation runs on one
 * approved activity record with the approved methodology edition, records everything it
 * used, never changes afterwards, and goes through its own review and approval.
 */
export class CalculationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly methodology: MethodologyService,
  ) {}

  async run(caller: Caller, activityRecordId: string, input: RunInput): Promise<CalculationDto> {
    const org = caller.organisationId;
    const id = await this.prisma.$transaction(async (tx) => {
      // Serialises against the record being revised and against another run.
      await lockRecord(tx, org, activityRecordId);
      const record = await tx.activityRecord.findFirst({
        where: { id: activityRecordId, organisationId: org },
        include: { flareSource: { select: { id: true, flareService: true } } },
      });
      if (!record) throw notFound('Activity record not found');
      if (record.status !== 'APPROVED') {
        throw conflict('Only approved activity records can be calculated');
      }
      if (record.activityType === 'OTHER_RELEASE') {
        throw fieldError('route', 'No approved methodology covers other gas releases yet');
      }
      const flaring = FLARING.includes(record.activityType);
      if (flaring === (input.route === 'COMPOSITION_VENTING')) {
        throw fieldError(
          'route',
          flaring ? 'Flaring records use a flaring route' : 'Venting records use the venting route',
        );
      }
      const open = await tx.calculation.findFirst({
        where: { organisationId: org, activityRecordId, status: { in: OPEN } },
        select: { version: true },
      });
      if (open) {
        throw conflict(
          `Calculation version ${String(open.version)} is still in progress; finish or discard it first`,
        );
      }

      const edition = await this.methodology.current(tx);
      const missing: string[] = [];
      if (!edition) {
        missing.push('An approved methodology edition (a Platform Administrator must approve one)');
      }

      const volume = record.standardVolumeMmscf ?? record.derivedVolumeMmscf;
      const volumeOrigin =
        record.standardVolumeMmscf !== null
          ? 'Activity record: total volume, standardised to 15 °C and 101.325 kPa'
          : 'Activity record: derived volume (rate × operating hours ÷ 24), standardised to 15 °C and 101.325 kPa';
      if (volume === null) {
        missing.push(
          'A volume on the activity record (a total volume, or a rate with actual operating hours)',
        );
      }

      const period = `${isoDateOf(record.periodStart)} to ${isoDateOf(record.periodEnd)}`;
      let composition = null;
      if (input.route !== 'IPCC_REFERENCE_FLARING') {
        const found = await coveringRecord(
          (where) =>
            tx.gasComposition.findMany({
              where: {
                organisationId: org,
                flareSourceId: record.flareSourceId,
                status: 'ACTIVE',
                ...where,
              },
              orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
            }),
          record.periodStart,
          record.periodEnd,
        );
        if (found.spansChange) {
          missing.push(
            `A single gas analysis for the whole period (${period}): a different analysis starts part-way through`,
          );
        } else if (!found.record) {
          missing.push(
            `A gas analysis for this flare source valid from ${isoDateOf(record.periodStart)} or earlier`,
          );
        }
        composition = found.spansChange ? null : found.record;
      }

      let efficiency: EngineEfficiency | undefined;
      let efficiencyId: string | null = null;
      if (input.route === 'COMPOSITION_FLARING') {
        if (input.efficiencySource === 'FLARE_RECORD') {
          const found = await coveringRecord(
            (where) =>
              tx.flareEfficiency.findMany({
                where: {
                  organisationId: org,
                  flareSourceId: record.flareSourceId,
                  status: 'ACTIVE',
                  basis: { in: ['MEASURED_TEST', 'VENDOR_SPECIFICATION'] },
                  ...where,
                },
                orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
              }),
            record.periodStart,
            record.periodEnd,
          );
          const e = found.spansChange ? null : found.record;
          if (found.spansChange) {
            missing.push(`A single flare efficiency record for the whole period (${period})`);
          } else if (!e?.uncombustedMethanePercent) {
            missing.push(
              `A tested or vendor flare efficiency valid from ${isoDateOf(record.periodStart)} or earlier`,
            );
          } else {
            efficiencyId = e.id;
            efficiency = {
              co2ConversionPercent: exact(e.combustionEfficiencyPercent),
              uncombustedMethanePercent: exact(e.uncombustedMethanePercent),
              origin: `Flare efficiency (${e.basis === 'MEASURED_TEST' ? 'measured test' : 'vendor specification'}): ${e.sourceReference}`,
            };
          }
        } else if (record.flareSource.flareService === null) {
          missing.push(
            'The flare source marked as production or refinery service, so the right default applies',
          );
        } else if (edition) {
          const ch4Key =
            record.flareSource.flareService === 'REFINERY'
              ? 'api.ch4_uncombusted_refinery'
              : 'api.ch4_uncombusted_production';
          const value = (key: string) => edition.parameters.find((p) => p.key === key)?.value;
          const co2 = value('api.co2_conversion_default');
          const ch4 = value(ch4Key);
          if (!co2 || !ch4) {
            missing.push('Methodology default efficiency values in the approved edition');
          } else {
            efficiency = {
              co2ConversionPercent: exact(co2),
              uncombustedMethanePercent: exact(ch4),
              origin: `Methodology default for ${record.flareSource.flareService === 'REFINERY' ? 'refinery' : 'production'} flares`,
              parameterKeys: {
                co2Conversion: 'api.co2_conversion_default',
                uncombustedMethane: ch4Key,
              },
            };
          }
        }
      }

      if (missing.length > 0 || !edition || volume === null) throw blocked(missing);

      const parameters = new Map(
        edition.parameters.map((p) => [
          p.key,
          { value: exact(p.value), unit: p.unit, name: p.name },
        ]),
      );
      let result;
      try {
        result = calculate({
          route: input.route,
          volumeMmscf: exact(volume),
          volumeOrigin,
          ...(composition
            ? {
                composition: {
                  components: componentsOf(composition),
                  hexanesPlusCarbonNumber: composition.hexanesPlusCarbonNumber
                    ? exact(composition.hexanesPlusCarbonNumber)
                    : null,
                  origin: `Gas analysis ${composition.sampleReference} (sampled ${isoDateOf(composition.sampleDate)})`,
                },
              }
            : {}),
          ...(efficiency ? { efficiency } : {}),
          parameters,
        });
      } catch (err) {
        if (err instanceof EngineError) throw blocked([err.message]);
        throw err;
      }

      const qualityReasons: string[] = [];
      if (record.measurementBasis === 'ESTIMATED') {
        qualityReasons.push('The activity volume is an estimate, not a measurement');
      }
      if (input.route === 'IPCC_REFERENCE_FLARING') {
        qualityReasons.push(
          'IPCC reference-case factors were used instead of the measured gas composition',
        );
      }
      if (input.efficiencySource === 'METHODOLOGY_DEFAULT') {
        qualityReasons.push(
          'The flare efficiency is the methodology default (API Compendium 2009 §4.6), not a test or vendor value',
        );
      }

      const latest = await tx.calculation.aggregate({
        where: { organisationId: org, activityRecordId },
        _max: { version: true },
      });
      const usedParameters = edition.parameters
        .filter((p) => result.parametersUsed.includes(p.key))
        .map(toParameterDto);
      const created = await tx.calculation.create({
        data: {
          organisationId: org,
          activityRecordId,
          flareSourceId: record.flareSourceId,
          version: (latest._max.version ?? 0) + 1,
          route: input.route,
          editionId: edition.id,
          efficiencySource: input.efficiencySource ?? null,
          flareEfficiencyId: efficiencyId,
          gasCompositionId: composition?.id ?? null,
          fallbackReason: input.fallbackReason ?? null,
          notes: input.notes ?? null,
          inputs: {
            route: ROUTE_LABEL[input.route],
            activity: {
              id: record.id,
              activityType: record.activityType,
              periodStart: isoDateOf(record.periodStart),
              periodEnd: isoDateOf(record.periodEnd),
              measurementBasis: record.measurementBasis,
              volumeMmscf: exact(volume),
              volumeOrigin,
              conversionVersion: record.conversionVersion,
            },
            composition: composition
              ? {
                  id: composition.id,
                  sampleReference: composition.sampleReference,
                  sampleDate: isoDateOf(composition.sampleDate),
                  validFrom: isoDateOf(composition.validFrom),
                  components: componentsOf(composition),
                  hexanesPlusCarbonNumber: composition.hexanesPlusCarbonNumber
                    ? exact(composition.hexanesPlusCarbonNumber)
                    : null,
                }
              : null,
            efficiency: efficiency
              ? {
                  id: efficiencyId,
                  co2ConversionPercent: efficiency.co2ConversionPercent,
                  uncombustedMethanePercent: efficiency.uncombustedMethanePercent,
                  origin: efficiency.origin,
                }
              : null,
            edition: {
              id: edition.id,
              code: edition.code,
              edition: edition.edition,
              title: edition.title,
            },
            parameters: usedParameters,
          } as unknown as Prisma.InputJsonValue,
          steps: result.steps as unknown as Prisma.InputJsonValue,
          engineVersion: ENGINE_VERSION,
          volumeM3: result.volumeM3,
          co2Tonnes: result.co2Tonnes,
          ch4Tonnes: result.ch4Tonnes,
          n2oTonnes: result.n2oTonnes,
          co2eTonnes: result.co2eTonnes,
          dataQuality: qualityReasons.length > 0 ? 'ESTIMATED' : 'MEASURED_BASIS',
          qualityReasons,
          createdById: caller.userId,
          updatedById: caller.userId,
        },
      });
      await this.addEvent(
        tx,
        org,
        created.id,
        'CALCULATED',
        null,
        'CALCULATED',
        caller.userId,
        input.notes ?? null,
      );
      await this.audit(tx, caller, 'calculation.created', created.id, {
        activityRecordId,
        version: created.version,
        route: input.route,
        editionId: edition.id,
        co2eTonnes: result.co2eTonnes,
      });
      return created.id;
    });
    return this.get(org, caller, id);
  }

  async listForRecord(organisationId: string, viewer: Viewer, activityRecordId: string) {
    const record = await this.prisma.activityRecord.findFirst({
      where: { id: activityRecordId, organisationId },
      select: { id: true },
    });
    if (!record) throw notFound('Activity record not found');
    const rows = await this.prisma.calculation.findMany({
      where: { organisationId, activityRecordId },
      include,
      orderBy: { version: 'desc' },
    });
    return this.toDtos(organisationId, viewer, rows);
  }

  async list(organisationId: string, viewer: Viewer, query: CalculationListQuery) {
    const where: Prisma.CalculationWhereInput = {
      organisationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.claimedBy === 'me' ? { claimedById: viewer.userId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.calculation.findMany({
        where,
        include,
        orderBy:
          query.sort === 'submitted'
            ? [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.calculation.count({ where }),
    ]);
    return { items: await this.toDtos(organisationId, viewer, rows), total };
  }

  async get(organisationId: string, viewer: Viewer, id: string): Promise<CalculationDto> {
    const row = await this.prisma.calculation.findFirst({ where: { id, organisationId }, include });
    if (!row) throw notFound('Calculation not found');
    const [dto] = await this.toDtos(organisationId, viewer, [row]);
    if (!dto) throw notFound('Calculation not found');
    return dto;
  }

  async history(organisationId: string, id: string): Promise<CalculationEventDto[]> {
    const row = await this.prisma.calculation.findFirst({
      where: { id, organisationId },
      select: { id: true },
    });
    if (!row) throw notFound('Calculation not found');
    const events = await this.prisma.calculationEvent.findMany({
      where: { organisationId, calculationId: id },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: e.actor,
      comment: e.comment,
      relatedCalculationId:
        ((e.details ?? {}) as { relatedCalculationId?: string }).relatedCalculationId ?? null,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async act(caller: Caller, id: string, action: CalculationAction, comment: string | undefined) {
    if (CALCULATION_COMMENT_REQUIRED.includes(action) && !comment) {
      throw fieldError('comment', 'Give a reason');
    }
    const org = caller.organisationId;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM calculations WHERE id = ${id}::uuid AND "organisationId" = ${org}::uuid FOR UPDATE`;
      const calc = await tx.calculation.findFirst({ where: { id, organisationId: org } });
      if (!calc) throw notFound('Calculation not found');
      const inv = (await this.involvementOf(tx, org, [calc])).get(id) ?? {
        involved: new Set<string>([calc.createdById]),
        reviewers: new Set<string>(),
      };
      const refusal = calculationRefusal(action, calc, caller, inv);
      if (refusal) throw refusalError(refusal);

      const now = new Date();
      if (action === 'approve') {
        // Locked so a revision of the record can't be approved at the same moment
        // (lock order: calculation, then activity record; nothing locks the reverse way).
        await lockRecord(tx, org, calc.activityRecordId);
        const record = await tx.activityRecord.findFirst({
          where: { id: calc.activityRecordId, organisationId: org },
          select: { status: true },
        });
        if (record?.status !== 'APPROVED') {
          throw conflict(
            'The activity record has been revised since this calculation; recalculate it instead',
          );
        }
      }
      const t = TRANSITIONS[action];
      await tx.calculation.update({
        where: { id },
        data: {
          status: t.to,
          updatedById: caller.userId,
          ...(action === 'start-review'
            ? { claimedById: caller.userId, claimedAt: now }
            : calc.claimedById
              ? { claimedById: null, claimedAt: null }
              : {}),
          ...(action === 'submit' ? { submittedAt: now } : {}),
          ...(action === 'approve' ? { approvedAt: now, approvedById: caller.userId } : {}),
          ...(action === 'discard' ? { discardedAt: now } : {}),
        },
      });
      await this.addEvent(tx, org, id, t.event, calc.status, t.to, caller.userId, comment ?? null);
      await this.audit(tx, caller, `calculation.${action.replace('-', '_')}`, id, {
        fromStatus: calc.status,
        toStatus: t.to,
        ...(comment ? { comment } : {}),
      });

      if (action === 'approve') {
        // The newly approved version replaces the previously approved one.
        const previous = await tx.calculation.findFirst({
          where: {
            organisationId: org,
            activityRecordId: calc.activityRecordId,
            status: 'APPROVED',
            id: { not: id },
          },
        });
        if (previous) {
          await tx.calculation.update({
            where: { id: previous.id },
            data: { status: 'SUPERSEDED', supersededAt: now, updatedById: caller.userId },
          });
          await this.addEvent(
            tx,
            org,
            previous.id,
            'SUPERSEDED',
            'APPROVED',
            'SUPERSEDED',
            caller.userId,
            null,
            {
              relatedCalculationId: id,
            },
          );
          await this.audit(tx, caller, 'calculation.superseded', previous.id, { supersededBy: id });
        }
      }
    });
    return this.get(org, caller, id);
  }

  /**
   * Releases every calculation review claim a person holds in the organisation (back to
   * Submitted), with a CLAIM_RELEASED step and an audit entry for each, as a manual release
   * does. Used when the reviewer is removed from the organisation (§7.2), inside the
   * caller's transaction. Returns the count.
   */
  async releaseClaimsHeldBy(
    tx: Prisma.TransactionClient,
    actor: Actor,
    claimantId: string,
    comment: string,
  ): Promise<number> {
    const org = actor.organisationId;
    const claimed = await tx.calculation.findMany({
      where: { organisationId: org, status: 'UNDER_REVIEW', claimedById: claimantId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let released = 0;
    for (const { id } of claimed) {
      await tx.$queryRaw`SELECT id FROM calculations WHERE id = ${id}::uuid AND "organisationId" = ${org}::uuid FOR UPDATE`;
      const calc = await tx.calculation.findFirst({ where: { id, organisationId: org } });
      if (calc?.status !== 'UNDER_REVIEW' || calc.claimedById !== claimantId) continue;
      const t = TRANSITIONS['release-claim'];
      await tx.calculation.update({
        where: { id },
        data: { status: t.to, updatedById: actor.userId, claimedById: null, claimedAt: null },
      });
      await this.addEvent(tx, org, id, t.event, calc.status, t.to, actor.userId, comment, {
        reason: 'member_removed',
        claimantId,
      });
      await recordAudit(tx, {
        organisationId: org,
        actorUserId: actor.userId,
        action: 'calculation.release_claim',
        entityType: 'Calculation',
        entityId: id,
        metadata: {
          fromStatus: calc.status,
          toStatus: t.to,
          comment,
          reason: 'member_removed',
          claimantId,
        },
        ipAddress: actor.ipAddress,
      });
      released += 1;
    }
    return released;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async toDtos(
    organisationId: string,
    viewer: Viewer,
    rows: CalculationRow[],
  ): Promise<CalculationDto[]> {
    const involvement = await this.involvementOf(this.prisma, organisationId, rows);
    return rows.map((c) => {
      const inv = involvement.get(c.id) ?? {
        involved: new Set<string>(),
        reviewers: new Set<string>(),
      };
      const inputs = c.inputs as Record<string, unknown> & {
        parameters?: { key: string; value: string; sourceDocument: string }[];
      };
      const param = (key: string) => inputs.parameters?.find((p) => p.key === key);
      return {
        id: c.id,
        organisationId: c.organisationId,
        activityRecordId: c.activityRecordId,
        version: c.version,
        route: c.route,
        edition: c.edition,
        efficiencySource: c.efficiencySource,
        flareEfficiencyId: c.flareEfficiencyId,
        gasCompositionId: c.gasCompositionId,
        fallbackReason: c.fallbackReason,
        notes: c.notes,
        activity: {
          id: c.activityRecord.id,
          kind: c.activityRecord.kind,
          activityType: c.activityRecord.activityType,
          periodStart: isoDateOf(c.activityRecord.periodStart),
          periodEnd: isoDateOf(c.activityRecord.periodEnd),
          status: c.activityRecord.status,
        },
        flareSource: {
          id: c.flareSource.id,
          name: c.flareSource.name,
          code: c.flareSource.code,
          facilityName: c.flareSource.asset.facility.name,
        },
        volumeM3: exact(c.volumeM3),
        results: {
          co2Tonnes: exact(c.co2Tonnes),
          ch4Tonnes: exact(c.ch4Tonnes),
          n2oTonnes: c.n2oTonnes ? exact(c.n2oTonnes) : null,
          co2eTonnes: exact(c.co2eTonnes),
          gwp: {
            co2: param('gwp.co2')?.value ?? '',
            ch4: param('gwp.ch4')?.value ?? '',
            n2o: param('gwp.n2o')?.value ?? null,
            source: param('gwp.ch4')?.sourceDocument ?? '',
          },
        },
        steps: c.steps as unknown as CalculationStepDto[],
        inputs,
        engineVersion: c.engineVersion,
        dataQuality: c.dataQuality,
        qualityReasons: c.qualityReasons as string[],
        status: c.status,
        activityRevised: c.activityRecord.status === 'SUPERSEDED',
        submittedAt: c.submittedAt?.toISOString() ?? null,
        claim:
          c.claimedById && c.claimedAt && c.claimedBy
            ? { byId: c.claimedById, byName: c.claimedBy.name, at: c.claimedAt.toISOString() }
            : null,
        approval:
          c.approvedAt && c.approvedById && c.approvedBy
            ? { at: c.approvedAt.toISOString(), byId: c.approvedById, byName: c.approvedBy.name }
            : null,
        supersededAt: c.supersededAt?.toISOString() ?? null,
        availableActions: calculationActions(c, viewer, inv),
        separationOfDuties: calculationSeparationNote(c, viewer, inv),
        createdBy: c.createdBy,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });
  }

  /** Who ran or submitted each calculation, and who reviewed it (from the history). */
  private async involvementOf(
    db: Db,
    organisationId: string,
    rows: { id: string; createdById: string }[],
  ) {
    const result = new Map<string, CalculationInvolvement>();
    for (const r of rows)
      result.set(r.id, { involved: new Set([r.createdById]), reviewers: new Set() });
    if (rows.length === 0) return result;
    const events = await db.calculationEvent.findMany({
      where: {
        organisationId,
        calculationId: { in: rows.map((r) => r.id) },
        type: { in: ['CALCULATED', 'SUBMITTED', 'REVIEW_STARTED'] },
      },
      select: { calculationId: true, type: true, actorId: true },
    });
    for (const e of events) {
      const entry = result.get(e.calculationId);
      if (!entry) continue;
      if (e.type === 'REVIEW_STARTED') entry.reviewers.add(e.actorId);
      else entry.involved.add(e.actorId);
    }
    return result;
  }

  private async addEvent(
    tx: Prisma.TransactionClient,
    organisationId: string,
    calculationId: string,
    type: CalculationEventType,
    fromStatus: CalculationStatus | null,
    toStatus: CalculationStatus,
    actorId: string,
    comment: string | null,
    details?: Prisma.InputJsonValue,
  ) {
    await tx.calculationEvent.create({
      data: {
        organisationId,
        calculationId,
        type,
        fromStatus,
        toStatus,
        actorId,
        comment,
        ...(details === undefined ? {} : { details }),
      },
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    caller: Caller,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: caller.organisationId,
      actorUserId: caller.userId,
      action,
      entityType: 'Calculation',
      entityId,
      metadata,
      ipAddress: caller.ipAddress,
    });
  }
}
