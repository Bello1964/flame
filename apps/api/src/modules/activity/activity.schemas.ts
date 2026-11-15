import { z } from 'zod';
import {
  ACTIVITY_RECORD_KINDS,
  ACTIVITY_TYPES,
  MEASUREMENT_BASES,
  MEASUREMENT_METHODS,
  PRESSURE_UNITS,
  RATE_UNITS,
  TEMPERATURE_UNITS,
  VOLUME_UNITS,
} from '@carbon/shared';

/**
 * Validation of activity-record input. Rules: ARCHITECTURAL_WORKFLOW.md §4.1.
 * Numbers arrive as decimal strings so the value is kept exactly as entered; anything
 * with more decimal places than the column holds is rejected, never rounded.
 */

const QUANTITY_PATTERN = /^(0|[1-9]\d{0,19})(\.\d{1,10})?$/;
const SIGNED_PATTERN = /^-?(0|[1-9]\d{0,19})(\.\d{1,10})?$/;
const Z_PATTERN = /^(0|[1-9]\d{0,5})(\.\d{1,6})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const quantity = z
  .string()
  .trim()
  .regex(
    QUANTITY_PATTERN,
    'Enter a number of zero or more, with at most 10 decimal places (no signs or thousands separators)',
  );

const signedQuantity = z
  .string()
  .trim()
  .regex(SIGNED_PATTERN, 'Enter a number with at most 10 decimal places');

const zFactor = z
  .string()
  .trim()
  .regex(Z_PATTERN, 'Enter Z as a number with at most 6 decimal places')
  .refine((v) => Number(v) > 0, 'Z must be greater than zero');

/** A real calendar date in YYYY-MM-DD form (e.g. rejects 2026-02-30). */
export const isoDate = z
  .string()
  .regex(DATE_PATTERN, 'Use the date format YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Not a real calendar date');

const text = (max: number) => z.string().trim().min(1).max(max);

/** All fields of a record except its flare source and kind (which never change). */
const fields = {
  periodStart: isoDate,
  /** Required for PERIOD; for DAILY it may be omitted and then equals periodStart. */
  periodEnd: isoDate.nullable().optional(),
  activityType: z.enum(ACTIVITY_TYPES),
  otherTypeDescription: text(500).nullable().optional(),
  averageRate: z
    .strictObject({ value: quantity, unit: z.enum(RATE_UNITS) })
    .nullable()
    .optional(),
  totalVolume: z
    .strictObject({ value: quantity, unit: z.enum(VOLUME_UNITS) })
    .nullable()
    .optional(),
  operatingHours: quantity
    .refine((v) => Number(v) > 0, 'Operating hours must be greater than zero')
    .nullable()
    .optional(),
  referenceTemperature: z.strictObject({
    value: signedQuantity,
    unit: z.enum(TEMPERATURE_UNITS),
  }),
  referencePressure: z.strictObject({ value: quantity, unit: z.enum(PRESSURE_UNITS) }),
  zSource: zFactor.nullable().optional(),
  zReference: zFactor.nullable().optional(),
  measurementBasis: z.enum(MEASUREMENT_BASES),
  estimateExplanation: text(2000).nullable().optional(),
  measurementMethod: z.enum(MEASUREMENT_METHODS),
  methodDescription: text(500).nullable().optional(),
  notes: text(2000).nullable().optional(),
};

const kind = z.enum(ACTIVITY_RECORD_KINDS);

/** Whole days covered by an inclusive local date range. */
export function daysInPeriod(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return ms / 86_400_000 + 1;
}

type FullRecordShape = z.infer<z.ZodObject<typeof fields>> & {
  kind: z.infer<typeof kind>;
};

/** Cross-field rules shared by create and (merged) update. */
function crossFieldRules(v: FullRecordShape, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };

  if (v.kind === 'DAILY') {
    if (v.periodEnd && v.periodEnd !== v.periodStart) {
      issue('periodEnd', 'A daily record covers a single day; leave the end date empty');
    }
  } else if (!v.periodEnd) {
    issue('periodEnd', 'Enter the last day of the reporting period');
  } else if (v.periodEnd <= v.periodStart) {
    issue('periodEnd', 'The period must end after it starts; use a daily record for one day');
  }

  if (!v.averageRate && !v.totalVolume) {
    issue('averageRate', 'Enter an average rate, a total volume, or both');
  }

  if (v.operatingHours) {
    const hours = Number(v.operatingHours);
    const end = v.kind === 'DAILY' ? v.periodStart : v.periodEnd;
    const maxHours = end && end >= v.periodStart ? daysInPeriod(v.periodStart, end) * 24 : 24;
    if (hours > maxHours) {
      issue(
        'operatingHours',
        v.kind === 'DAILY'
          ? 'A day has at most 24 operating hours'
          : `This period has at most ${String(maxHours)} hours`,
      );
    }
  }

  if (v.measurementBasis === 'ESTIMATED' && !v.estimateExplanation) {
    issue('estimateExplanation', 'Explain how the estimate was made');
  }
  if (v.measurementMethod === 'OTHER' && !v.methodDescription) {
    issue('methodDescription', 'Describe the measurement method');
  }
  if (v.activityType === 'OTHER_RELEASE' && !v.otherTypeDescription) {
    issue('otherTypeDescription', 'Describe the type of gas release');
  }
  if (Boolean(v.zSource) !== Boolean(v.zReference)) {
    issue(v.zSource ? 'zReference' : 'zSource', 'Enter both compressibility factors, or neither');
  }
}

/** A complete record, as validated for create and for the merged result of an update. */
export const activityRecordSchema = z.object({ ...fields, kind }).superRefine(crossFieldRules);

export const activityCreateSchema = z
  .strictObject({
    flareSourceId: z.uuid(),
    kind,
    ...fields,
    /** Save even though the record overlaps another (after the user has seen the warning). */
    acknowledgeOverlap: z.boolean().optional(),
  })
  .superRefine(crossFieldRules);

/** Flare source and kind cannot change; every other field may. */
export const activityUpdateSchema = z
  .strictObject({
    periodStart: fields.periodStart.optional(),
    periodEnd: fields.periodEnd,
    activityType: fields.activityType.optional(),
    otherTypeDescription: fields.otherTypeDescription,
    averageRate: fields.averageRate,
    totalVolume: fields.totalVolume,
    operatingHours: fields.operatingHours,
    referenceTemperature: fields.referenceTemperature.optional(),
    referencePressure: fields.referencePressure.optional(),
    zSource: fields.zSource,
    zReference: fields.zReference,
    measurementBasis: fields.measurementBasis.optional(),
    estimateExplanation: fields.estimateExplanation,
    measurementMethod: fields.measurementMethod.optional(),
    methodDescription: fields.methodDescription,
    notes: fields.notes,
    acknowledgeOverlap: z.boolean().optional(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'acknowledgeOverlap'),
    'Provide at least one field to update',
  );

export const withdrawSchema = z.strictObject({
  reason: text(2000),
});

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  flareSourceId: z.uuid().optional(),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  status: z.enum(['DRAFT', 'WITHDRAWN', 'ALL']).default('DRAFT'),
  /** Records whose period ends on or after this date. */
  from: isoDate.optional(),
  /** Records whose period starts on or before this date. */
  to: isoDate.optional(),
});

export const settingsUpdateSchema = z
  .strictObject({
    defaultReferenceTemperature: fields.referenceTemperature.optional(),
    defaultReferencePressure: fields.referencePressure.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting to update');

export type ActivityRecordInput = z.output<typeof activityRecordSchema>;
export type ActivityCreate = z.output<typeof activityCreateSchema>;
export type ActivityUpdate = z.output<typeof activityUpdateSchema>;
export type ActivityListQuery = z.output<typeof activityListQuerySchema>;
export type SettingsUpdate = z.output<typeof settingsUpdateSchema>;
