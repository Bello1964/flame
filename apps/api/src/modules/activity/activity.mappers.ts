import { CANONICAL_REFERENCE, type ActivityRecordDto, type ActivityWarning } from '@flame/shared';
import { Prisma, type ActivityRecord } from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { isoDateOf } from './activity.repository.js';
import { rateVolumeDifferencePercent, RATE_VOLUME_TOLERANCE_PERCENT } from './standardise.js';

/** Explicit response shape: only listed fields leave the API; decimals become exact strings. */
export function toActivityDto(r: ActivityRecord, warnings: ActivityWarning[]): ActivityRecordDto {
  const quantity = <U extends string>(
    value: Prisma.Decimal | null,
    unit: U | null,
    entered: string | null,
  ) =>
    value !== null && unit !== null && entered !== null
      ? { value: exact(value), unit, entered }
      : null;
  const plain = (value: Prisma.Decimal | null, entered: string | null) =>
    value !== null && entered !== null ? { value: exact(value), entered } : null;

  return {
    id: r.id,
    organisationId: r.organisationId,
    flareSourceId: r.flareSourceId,
    kind: r.kind,
    activityType: r.activityType,
    otherTypeDescription: r.otherTypeDescription,
    periodStart: isoDateOf(r.periodStart),
    periodEnd: isoDateOf(r.periodEnd),
    timeZone: r.timeZone,
    averageRate: quantity(r.averageRate, r.rateUnit, r.averageRateInput),
    totalVolume: quantity(r.totalVolume, r.volumeUnit, r.totalVolumeInput),
    operatingHours: plain(r.operatingHours, r.operatingHoursInput),
    referenceTemperature: {
      value: exact(r.referenceTemperature),
      unit: r.referenceTemperatureUnit,
      entered: r.referenceTemperatureInput,
    },
    referencePressure: {
      value: exact(r.referencePressure),
      unit: r.referencePressureUnit,
      entered: r.referencePressureInput,
    },
    zSource: plain(r.zSource, r.zSourceInput),
    zReference: plain(r.zReference, r.zReferenceInput),
    compressibilitySource: r.compressibilitySource,
    measurementBasis: r.measurementBasis,
    estimateExplanation: r.estimateExplanation,
    measurementMethod: r.measurementMethod,
    methodDescription: r.methodDescription,
    dataSource: r.dataSource,
    notes: r.notes,
    standardised: {
      referenceCondition: CANONICAL_REFERENCE.label,
      averageRateMmscfd: r.standardRateMmscfd ? exact(r.standardRateMmscfd) : null,
      totalVolumeMmscf: r.standardVolumeMmscf ? exact(r.standardVolumeMmscf) : null,
      derivedVolumeMmscf: r.derivedVolumeMmscf ? exact(r.derivedVolumeMmscf) : null,
      correctionFactor: exact(r.correctionFactor),
      conversionVersion: r.conversionVersion,
      standardisedAt: r.standardisedAt.toISOString(),
    },
    status: r.status,
    withdrawal:
      r.withdrawnAt && r.withdrawnById && r.withdrawalReason
        ? { at: r.withdrawnAt.toISOString(), byId: r.withdrawnById, reason: r.withdrawalReason }
        : null,
    overlapAcknowledgedAt: r.overlapAcknowledgedAt?.toISOString() ?? null,
    warnings,
    createdById: r.createdById,
    updatedById: r.updatedById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

interface OverlapCandidate {
  id: string;
  flareSourceId: string;
  activityType: ActivityRecord['activityType'];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Data-quality warnings for a record, worked out at read time so they stay current as
 * other records are added or withdrawn. Withdrawn records carry none. Warnings never
 * change any value.
 */
export function warningsFor(r: ActivityRecord, candidates: OverlapCandidate[]): ActivityWarning[] {
  if (r.status !== 'DRAFT') return [];
  const warnings: ActivityWarning[] = [];

  const overlapping = candidates
    .filter(
      (c) =>
        c.id !== r.id &&
        c.flareSourceId === r.flareSourceId &&
        c.activityType === r.activityType &&
        c.periodStart <= r.periodEnd &&
        c.periodEnd >= r.periodStart,
    )
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((c) => ({
      id: c.id,
      periodStart: isoDateOf(c.periodStart),
      periodEnd: isoDateOf(c.periodEnd),
    }));
  if (overlapping.length > 0) {
    warnings.push({
      code: 'OVERLAP',
      message: `Overlaps ${String(overlapping.length)} other record${overlapping.length === 1 ? '' : 's'} for this flare source and activity type`,
      overlapping,
    });
  }

  const difference = rateVolumeDifferencePercent(
    r.derivedVolumeMmscf ? exact(r.derivedVolumeMmscf) : null,
    r.standardVolumeMmscf ? exact(r.standardVolumeMmscf) : null,
  );
  if (difference && difference.gt(RATE_VOLUME_TOLERANCE_PERCENT)) {
    warnings.push(
      difference.isFinite()
        ? {
            code: 'RATE_VOLUME_MISMATCH',
            message: `Rate × operating hours differs from the entered volume by ${percentLabel(difference)}%`,
            differencePercent: percentLabel(difference),
          }
        : {
            code: 'RATE_VOLUME_MISMATCH',
            message: 'The entered volume is zero, but rate × operating hours is not',
          },
    );
  }

  warnings.push({
    code: 'NO_EVIDENCE',
    message: 'No supporting evidence is attached (evidence uploads arrive in a later milestone)',
  });
  return warnings;
}

/**
 * The difference with 2 decimal places, or more when needed so the shown figure is
 * visibly above the tolerance (1.004% shows as "1.004", not a misleading "1.00").
 */
function percentLabel(difference: Prisma.Decimal): string {
  let places = 2;
  while (
    places < 6 &&
    !new Prisma.Decimal(difference.toFixed(places)).gt(RATE_VOLUME_TOLERANCE_PERCENT)
  ) {
    places += 1;
  }
  return difference.toFixed(places);
}
