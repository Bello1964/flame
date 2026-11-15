import { OVERLAP_UNCONFIRMED_CODE, type OverlapErrorDetails } from '@carbon/shared';
import type { ActivityRecord, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { exact } from '../../lib/decimal.js';
import { recordAudit } from '../audit/audit.service.js';
import { changeSet, withStoredValues } from '../audit/change-set.js';
import { lockFlareSource } from '../facilities/facilities.repository.js';
import type { Actor } from '../facilities/facilities.service.js';
import * as repo from './activity.repository.js';
import { toActivityDto, warningsFor } from './activity.mappers.js';
import {
  activityRecordSchema,
  type ActivityCreate,
  type ActivityListQuery,
  type ActivityRecordInput,
  type ActivityUpdate,
} from './activity.schemas.js';
import { standardise, StandardisationError, type StandardiseResult } from './standardise.js';

/** A 400 VALIDATION_ERROR on one field, in the same shape as schema validation errors. */
function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

/** Today's date (YYYY-MM-DD) in an IANA time zone. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Keys compared to decide whether an update changes anything (all scalar columns). */
const COMPARED_KEYS = [
  'periodStart',
  'periodEnd',
  'timeZone',
  'activityType',
  'otherTypeDescription',
  'averageRate',
  'averageRateInput',
  'rateUnit',
  'totalVolume',
  'totalVolumeInput',
  'volumeUnit',
  'operatingHours',
  'operatingHoursInput',
  'referenceTemperature',
  'referenceTemperatureInput',
  'referenceTemperatureUnit',
  'referencePressure',
  'referencePressureInput',
  'referencePressureUnit',
  'zSource',
  'zSourceInput',
  'zReference',
  'zReferenceInput',
  'measurementBasis',
  'estimateExplanation',
  'measurementMethod',
  'methodDescription',
  'notes',
  'standardRateMmscfd',
  'standardVolumeMmscf',
  'derivedVolumeMmscf',
  'correctionFactor',
  'conversionVersion',
] as const;

/**
 * Business rules for gas activity data (ARCHITECTURAL_WORKFLOW.md §4.1):
 * - Every read and write is scoped to the actor's organisation.
 * - Records are DRAFT (editable) or WITHDRAWN (read-only, kept for history).
 * - Quantities are standardised server-side at save; the input is kept exactly.
 * - Overlapping drafts for the same flare source and activity type need the user's
 *   explicit confirmation (409 OVERLAP_UNCONFIRMED until acknowledgeOverlap is sent).
 * - Each change writes an audit entry in the same transaction.
 */
export class ActivityService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organisationId: string, query: ActivityListQuery) {
    const { items, total } = await repo.listRecords(this.prisma, organisationId, query);
    return { items: await this.withWarnings(organisationId, items), total };
  }

  async get(organisationId: string, id: string) {
    const record = await repo.findRecord(this.prisma, organisationId, id);
    if (!record) throw notFound('Activity record not found');
    const [dto] = await this.withWarnings(organisationId, [record]);
    if (!dto) throw notFound('Activity record not found');
    return dto;
  }

  async create(actor: Actor, input: ActivityCreate) {
    const saved = await this.prisma.$transaction(async (tx) => {
      // Serialises against archiving the flare source and against overlapping creates.
      await lockFlareSource(tx, actor.organisationId, input.flareSourceId);
      const source = await repo.findFlareSourceForActivity(
        tx,
        actor.organisationId,
        input.flareSourceId,
      );
      // Another organisation's flare source is indistinguishable from a missing one.
      if (!source) throw notFound('Flare source not found');
      if (source.status !== 'ACTIVE') {
        throw conflict('Cannot add activity data to an archived flare source');
      }

      const timeZone = source.asset.facility.timeZone;
      const row = this.rowData(input, timeZone);
      const overlaps = await this.overlapsOrThrow(tx, actor, input, row, input.acknowledgeOverlap);

      const record = await tx.activityRecord.create({
        data: {
          ...row,
          organisationId: actor.organisationId,
          flareSourceId: input.flareSourceId,
          kind: input.kind,
          createdById: actor.userId,
          updatedById: actor.userId,
          ...(overlaps.length > 0
            ? { overlapAcknowledgedAt: new Date(), overlapAcknowledgedById: actor.userId }
            : {}),
        },
      });
      const { acknowledgeOverlap: _ack, ...auditInput } = input;
      await this.audit(tx, actor, 'activity_record.created', record.id, {
        input: auditInput,
        standardised: this.standardisedSummary(record),
        ...(overlaps.length > 0 ? { overlapAcknowledged: overlaps.map((o) => o.id) } : {}),
      });
      return record;
    });
    return this.get(actor.organisationId, saved.id);
  }

  async update(actor: Actor, id: string, input: ActivityUpdate) {
    await this.prisma.$transaction(async (tx) => {
      await repo.lockRecord(tx, actor.organisationId, id);
      const existing = await repo.findRecord(tx, actor.organisationId, id);
      if (!existing) throw notFound('Activity record not found');
      if (existing.status !== 'DRAFT') {
        throw conflict('Withdrawn activity records are read-only');
      }
      await lockFlareSource(tx, actor.organisationId, existing.flareSourceId);
      const source = await repo.findFlareSourceForActivity(
        tx,
        actor.organisationId,
        existing.flareSourceId,
      );
      if (!source) throw notFound('Flare source not found');
      if (source.status !== 'ACTIVE') {
        throw conflict('The flare source is archived, so its activity records are read-only');
      }

      // Validate the record as it would be after the change, not just the patch.
      const { acknowledgeOverlap, ...patch } = input;
      const merged: ActivityRecordInput = activityRecordSchema.parse({
        ...this.inputOf(existing),
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        kind: existing.kind,
      });

      // A record keeps the time zone it was entered in. Re-stamping it with the facility's
      // current zone would silently move the record to a different 24-hour window.
      const row = this.rowData(merged, existing.timeZone);
      const datesOrTypeChanged =
        row.periodStart.getTime() !== existing.periodStart.getTime() ||
        row.periodEnd.getTime() !== existing.periodEnd.getTime() ||
        row.activityType !== existing.activityType;
      // An overlap the user already confirmed doesn't need confirming again for edits
      // that leave the period and activity type as they were.
      const alreadyConfirmed = existing.overlapAcknowledgedAt !== null && !datesOrTypeChanged;
      const overlaps = await this.overlapsOrThrow(
        tx,
        actor,
        { flareSourceId: existing.flareSourceId, activityType: row.activityType },
        row,
        acknowledgeOverlap === true || alreadyConfirmed,
        existing.id,
      );

      const comparable = Object.fromEntries(COMPARED_KEYS.map((k) => [k, row[k]]));
      const changes = changeSet(existing, comparable);
      const ack =
        overlaps.length === 0
          ? { overlapAcknowledgedAt: null, overlapAcknowledgedById: null }
          : alreadyConfirmed
            ? {}
            : { overlapAcknowledgedAt: new Date(), overlapAcknowledgedById: actor.userId };
      // A new confirmation, or clearing a confirmation that no longer applies, is a change.
      const ackChanged =
        'overlapAcknowledgedAt' in ack &&
        (ack.overlapAcknowledgedAt !== null || existing.overlapAcknowledgedAt !== null);
      // An edit that changes nothing writes nothing (no update, no audit entry).
      if (Object.keys(changes).length === 0 && !ackChanged) return;

      const updated = await tx.activityRecord.update({
        where: { id: existing.id },
        data: { ...row, ...ack, updatedById: actor.userId },
      });
      await this.audit(tx, actor, 'activity_record.updated', id, {
        changes: withStoredValues(changes, updated),
        ...(overlaps.length > 0 && !alreadyConfirmed
          ? { overlapAcknowledged: overlaps.map((o) => o.id) }
          : {}),
        ...(overlaps.length === 0 && existing.overlapAcknowledgedAt !== null
          ? { overlapAcknowledgementCleared: true }
          : {}),
      });
    });
    return this.get(actor.organisationId, id);
  }

  async withdraw(actor: Actor, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await repo.lockRecord(tx, actor.organisationId, id);
      const existing = await repo.findRecord(tx, actor.organisationId, id);
      if (!existing) throw notFound('Activity record not found');
      if (existing.status !== 'DRAFT') throw conflict('This activity record is already withdrawn');
      await tx.activityRecord.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawnById: actor.userId,
          withdrawalReason: reason,
          updatedById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'activity_record.withdrawn', id, { reason });
    });
    return this.get(actor.organisationId, id);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async withWarnings(organisationId: string, records: ActivityRecord[]) {
    const drafts = records.filter((r) => r.status === 'DRAFT');
    const candidates = await repo.overlapCandidates(this.prisma, organisationId, drafts);
    return records.map((r) => toActivityDto(r, warningsFor(r, candidates)));
  }

  /**
   * Overlapping drafts for the record's flare source and activity type. Throws 409
   * OVERLAP_UNCONFIRMED listing them unless the user has confirmed.
   */
  private async overlapsOrThrow(
    tx: Prisma.TransactionClient,
    actor: Actor,
    target: { flareSourceId: string; activityType: ActivityRecord['activityType'] },
    row: { periodStart: Date; periodEnd: Date },
    confirmed: boolean | undefined,
    excludeId?: string,
  ) {
    const overlaps = await repo.findOverlapping(
      tx,
      actor.organisationId,
      target.flareSourceId,
      target.activityType,
      row.periodStart,
      row.periodEnd,
      excludeId,
    );
    if (overlaps.length > 0 && !confirmed) {
      const details: OverlapErrorDetails = {
        overlapping: overlaps.map((o) => ({
          id: o.id,
          periodStart: repo.isoDateOf(o.periodStart),
          periodEnd: repo.isoDateOf(o.periodEnd),
        })),
      };
      throw new AppError(
        409,
        OVERLAP_UNCONFIRMED_CODE,
        `This record overlaps ${String(overlaps.length)} other record${overlaps.length === 1 ? '' : 's'} for the same flare source and activity type. Confirm to save it anyway.`,
        details,
      );
    }
    return overlaps;
  }

  /** Validated input → the stored columns, including the server-side standardisation. */
  private rowData(input: ActivityRecordInput | ActivityCreate, timeZone: string) {
    const periodEnd =
      input.kind === 'DAILY' ? input.periodStart : (input.periodEnd ?? input.periodStart);
    const today = todayIn(timeZone);
    if (periodEnd > today) {
      throw fieldError(
        input.kind === 'DAILY' ? 'periodStart' : 'periodEnd',
        `Dates in the future can't be recorded (today is ${today} at the facility, ${timeZone})`,
      );
    }

    const rate = input.averageRate ?? null;
    const volume = input.totalVolume ?? null;
    const hours = input.operatingHours ?? null;
    const zSource = input.zSource ?? null;
    const zReference = input.zReference ?? null;

    let std: StandardiseResult;
    try {
      std = standardise({
        averageRate: rate,
        totalVolume: volume,
        operatingHours: hours,
        referenceTemperature: input.referenceTemperature,
        referencePressure: input.referencePressure,
        zSource,
        zReference,
      });
    } catch (err) {
      if (err instanceof StandardisationError) throw fieldError(err.field, err.message);
      throw err;
    }

    return {
      periodStart: repo.dateOf(input.periodStart),
      periodEnd: repo.dateOf(periodEnd),
      timeZone,
      activityType: input.activityType,
      // Explanations only travel with the choice that needs them.
      otherTypeDescription:
        input.activityType === 'OTHER_RELEASE' ? (input.otherTypeDescription ?? null) : null,
      averageRate: rate?.value ?? null,
      averageRateInput: rate?.value ?? null,
      rateUnit: rate?.unit ?? null,
      totalVolume: volume?.value ?? null,
      totalVolumeInput: volume?.value ?? null,
      volumeUnit: volume?.unit ?? null,
      operatingHours: hours,
      operatingHoursInput: hours,
      referenceTemperature: input.referenceTemperature.value,
      referenceTemperatureInput: input.referenceTemperature.value,
      referenceTemperatureUnit: input.referenceTemperature.unit,
      referencePressure: input.referencePressure.value,
      referencePressureInput: input.referencePressure.value,
      referencePressureUnit: input.referencePressure.unit,
      zSource,
      zSourceInput: zSource,
      zReference,
      zReferenceInput: zReference,
      measurementBasis: input.measurementBasis,
      estimateExplanation:
        input.measurementBasis === 'ESTIMATED' ? (input.estimateExplanation ?? null) : null,
      measurementMethod: input.measurementMethod,
      methodDescription:
        input.measurementMethod === 'OTHER' ? (input.methodDescription ?? null) : null,
      notes: input.notes ?? null,
      standardRateMmscfd: std.standardRateMmscfd,
      standardVolumeMmscf: std.standardVolumeMmscf,
      derivedVolumeMmscf: std.derivedVolumeMmscf,
      correctionFactor: std.correctionFactor,
      conversionVersion: std.conversionVersion,
      conversionDetails: std.details as unknown as Prisma.InputJsonValue,
      standardisedAt: new Date(),
    };
  }

  /** A stored record back in input form (using the values exactly as entered). */
  private inputOf(r: ActivityRecord): Omit<ActivityRecordInput, 'kind'> {
    return {
      periodStart: repo.isoDateOf(r.periodStart),
      periodEnd: r.kind === 'DAILY' ? null : repo.isoDateOf(r.periodEnd),
      activityType: r.activityType,
      otherTypeDescription: r.otherTypeDescription,
      averageRate:
        r.averageRateInput && r.rateUnit ? { value: r.averageRateInput, unit: r.rateUnit } : null,
      totalVolume:
        r.totalVolumeInput && r.volumeUnit
          ? { value: r.totalVolumeInput, unit: r.volumeUnit }
          : null,
      operatingHours: r.operatingHoursInput,
      referenceTemperature: {
        value: r.referenceTemperatureInput,
        unit: r.referenceTemperatureUnit,
      },
      referencePressure: { value: r.referencePressureInput, unit: r.referencePressureUnit },
      zSource: r.zSourceInput,
      zReference: r.zReferenceInput,
      measurementBasis: r.measurementBasis,
      estimateExplanation: r.estimateExplanation,
      measurementMethod: r.measurementMethod,
      methodDescription: r.methodDescription,
      notes: r.notes,
    };
  }

  private standardisedSummary(r: ActivityRecord) {
    return {
      averageRateMmscfd: r.standardRateMmscfd ? exact(r.standardRateMmscfd) : null,
      totalVolumeMmscf: r.standardVolumeMmscf ? exact(r.standardVolumeMmscf) : null,
      derivedVolumeMmscf: r.derivedVolumeMmscf ? exact(r.derivedVolumeMmscf) : null,
      correctionFactor: exact(r.correctionFactor),
      conversionVersion: r.conversionVersion,
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action,
      entityType: 'ActivityRecord',
      entityId,
      metadata,
      ipAddress: actor.ipAddress,
    });
  }
}
