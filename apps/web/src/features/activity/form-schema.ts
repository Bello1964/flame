import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  MEASUREMENT_BASES,
  MEASUREMENT_METHODS,
  PRESSURE_UNITS,
  RATE_UNITS,
  TEMPERATURE_UNITS,
  VOLUME_UNITS,
  type ActivityRecordDto,
  type OrganisationSettingsDto,
} from '@flame/shared';
import type { ActivityFields } from './api';
import { isCanonicalCondition } from './labels';

/**
 * Client-side validation mirroring the API (apps/api/src/modules/activity/activity.schemas.ts).
 * Early feedback only: the API validates every request again and its field errors are
 * shown in the same places.
 */

/** Earliest date activity can be recorded for; the API enforces the same rule. */
export const EARLIEST_ACTIVITY_DATE = '2000-01-01';

const QUANTITY = /^(0|[1-9]\d{0,19})(\.\d{1,10})?$/;
const SIGNED = /^-?(0|[1-9]\d{0,19})(\.\d{1,10})?$/;
const Z = /^(0|[1-9]\d{0,5})(\.\d{1,6})?$/;
const QUANTITY_MESSAGE =
  'Enter a number of zero or more, with at most 10 decimal places (no signs or separators)';

const optionalQuantity = z
  .string()
  .trim()
  .refine((v) => v === '' || QUANTITY.test(v), QUANTITY_MESSAGE);

export const activityFormSchema = z
  .object({
    kind: z.enum(['DAILY', 'PERIOD']),
    periodStart: z
      .string()
      .min(1, 'Enter the date')
      .refine((v) => v >= EARLIEST_ACTIVITY_DATE, "Dates before 1 January 2000 can't be recorded"),
    periodEnd: z.string(),
    activityType: z.enum(ACTIVITY_TYPES),
    otherTypeDescription: z.string().trim().max(500),
    rateValue: optionalQuantity,
    rateUnit: z.enum(RATE_UNITS),
    volumeValue: optionalQuantity,
    volumeUnit: z.enum(VOLUME_UNITS),
    operatingHours: optionalQuantity,
    temperatureValue: z.string().trim().regex(SIGNED, 'Enter the reference temperature'),
    temperatureUnit: z.enum(TEMPERATURE_UNITS),
    pressureValue: z.string().trim().regex(QUANTITY, 'Enter the absolute reference pressure'),
    pressureUnit: z.enum(PRESSURE_UNITS),
    zSource: z.string().trim(),
    zReference: z.string().trim(),
    compressibilitySource: z.string().trim().max(500),
    measurementBasis: z.enum(MEASUREMENT_BASES),
    estimateExplanation: z.string().trim().max(2000),
    measurementMethod: z.enum(MEASUREMENT_METHODS),
    methodDescription: z.string().trim().max(500),
    notes: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (v.kind === 'PERIOD') {
      if (!v.periodEnd) issue('periodEnd', 'Enter the last day of the period');
      else if (v.periodEnd <= v.periodStart) {
        issue('periodEnd', 'The period must end after it starts; use a daily record for one day');
      }
    }
    if (!v.rateValue && !v.volumeValue) {
      issue('rateValue', 'Enter an average rate, a total volume, or both');
    }
    if (v.operatingHours) {
      const hours = Number(v.operatingHours);
      if (hours <= 0) issue('operatingHours', 'Operating hours must be greater than zero');
      else if (v.kind === 'DAILY' && hours > 24) {
        issue('operatingHours', 'A day has at most 24 operating hours');
      }
    }
    if (v.activityType === 'OTHER_RELEASE' && !v.otherTypeDescription) {
      issue('otherTypeDescription', 'Describe the type of gas release');
    }
    if (v.measurementBasis === 'ESTIMATED' && !v.estimateExplanation) {
      issue('estimateExplanation', 'Explain how the estimate was made');
    }
    if (v.measurementMethod === 'OTHER' && !v.methodDescription) {
      issue('methodDescription', 'Describe the measurement method');
    }
    const canonical = isCanonicalCondition(
      { value: v.temperatureValue, unit: v.temperatureUnit },
      { value: v.pressureValue, unit: v.pressureUnit },
    );
    if (!canonical) {
      for (const field of ['zSource', 'zReference'] as const) {
        const value = v[field];
        if (!value) issue(field, 'Required because the condition differs from 15 °C / 101.325 kPa');
        else if (!Z.test(value) || Number(value) <= 0) {
          issue(field, 'Enter Z greater than zero, with at most 6 decimal places');
        }
      }
    }
  });

export type ActivityFormValues = z.infer<typeof activityFormSchema>;

/** Form field each API field error belongs to. */
export const API_FIELD_TO_FORM: Record<string, keyof ActivityFormValues> = {
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  activityType: 'activityType',
  otherTypeDescription: 'otherTypeDescription',
  averageRate: 'rateValue',
  totalVolume: 'volumeValue',
  operatingHours: 'operatingHours',
  referenceTemperature: 'temperatureValue',
  referencePressure: 'pressureValue',
  zSource: 'zSource',
  zReference: 'zReference',
  compressibilitySource: 'compressibilitySource',
  measurementBasis: 'measurementBasis',
  estimateExplanation: 'estimateExplanation',
  measurementMethod: 'measurementMethod',
  methodDescription: 'methodDescription',
  notes: 'notes',
};

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Form values → the API's fields. Values stay strings, exactly as typed. */
export function toActivityFields(v: ActivityFormValues): ActivityFields {
  const canonical = isCanonicalCondition(
    { value: v.temperatureValue, unit: v.temperatureUnit },
    { value: v.pressureValue, unit: v.pressureUnit },
  );
  return {
    periodStart: v.periodStart,
    periodEnd: v.kind === 'PERIOD' ? v.periodEnd : null,
    activityType: v.activityType,
    otherTypeDescription:
      v.activityType === 'OTHER_RELEASE' ? orNull(v.otherTypeDescription) : null,
    averageRate: v.rateValue ? { value: v.rateValue, unit: v.rateUnit } : null,
    totalVolume: v.volumeValue ? { value: v.volumeValue, unit: v.volumeUnit } : null,
    operatingHours: orNull(v.operatingHours),
    referenceTemperature: { value: v.temperatureValue, unit: v.temperatureUnit },
    referencePressure: { value: v.pressureValue, unit: v.pressureUnit },
    // At the canonical condition Z does not apply (and the API rejects it).
    zSource: canonical ? null : orNull(v.zSource),
    zReference: canonical ? null : orNull(v.zReference),
    compressibilitySource: canonical ? null : orNull(v.compressibilitySource),
    measurementBasis: v.measurementBasis,
    estimateExplanation: v.measurementBasis === 'ESTIMATED' ? orNull(v.estimateExplanation) : null,
    measurementMethod: v.measurementMethod,
    methodDescription: v.measurementMethod === 'OTHER' ? orNull(v.methodDescription) : null,
    notes: orNull(v.notes),
  };
}

/** Starting values: an existing record exactly as entered, or a blank record prefilled
 * with the organisation's default reference condition. */
export function initialValues(
  record: ActivityRecordDto | undefined,
  settings: OrganisationSettingsDto,
): ActivityFormValues {
  if (record) {
    return {
      kind: record.kind,
      periodStart: record.periodStart,
      periodEnd: record.kind === 'PERIOD' ? record.periodEnd : '',
      activityType: record.activityType,
      otherTypeDescription: record.otherTypeDescription ?? '',
      rateValue: record.averageRate?.entered ?? '',
      rateUnit: record.averageRate?.unit ?? 'MMSCF_PER_DAY',
      volumeValue: record.totalVolume?.entered ?? '',
      volumeUnit: record.totalVolume?.unit ?? 'MMSCF',
      operatingHours: record.operatingHours?.entered ?? '',
      temperatureValue: record.referenceTemperature.entered,
      temperatureUnit: record.referenceTemperature.unit,
      pressureValue: record.referencePressure.entered,
      pressureUnit: record.referencePressure.unit,
      zSource: record.zSource?.entered ?? '',
      zReference: record.zReference?.entered ?? '',
      compressibilitySource: record.compressibilitySource ?? '',
      measurementBasis: record.measurementBasis,
      estimateExplanation: record.estimateExplanation ?? '',
      measurementMethod: record.measurementMethod,
      methodDescription: record.methodDescription ?? '',
      notes: record.notes ?? '',
    };
  }
  return {
    kind: 'DAILY',
    periodStart: '',
    periodEnd: '',
    activityType: 'ROUTINE_FLARING',
    otherTypeDescription: '',
    rateValue: '',
    rateUnit: 'MMSCF_PER_DAY',
    volumeValue: '',
    volumeUnit: 'MMSCF',
    operatingHours: '',
    temperatureValue: settings.defaultReferenceTemperature.value,
    temperatureUnit: settings.defaultReferenceTemperature.unit,
    pressureValue: settings.defaultReferencePressure.value,
    pressureUnit: settings.defaultReferencePressure.unit,
    // The organisation's Z defaults belong to its default condition, which prefills above.
    zSource: settings.defaultCompressibility?.zSource ?? '',
    zReference: settings.defaultCompressibility?.zReference ?? '',
    compressibilitySource: settings.defaultCompressibility?.source ?? '',
    measurementBasis: 'MEASURED',
    estimateExplanation: '',
    measurementMethod: 'METERED',
    methodDescription: '',
    notes: '',
  };
}
