/**
 * Gas activity data (Milestone 2). Operational quantities only; no emissions.
 * Rules: docs/architecture/ARCHITECTURAL_WORKFLOW.md §4.1.
 */

export const ACTIVITY_RECORD_KINDS = ['DAILY', 'PERIOD'] as const;
export type ActivityRecordKind = (typeof ACTIVITY_RECORD_KINDS)[number];

export const ACTIVITY_TYPES = [
  'ROUTINE_FLARING',
  'NON_ROUTINE_FLARING',
  'EMERGENCY_FLARING',
  'VENTING',
  'OTHER_RELEASE',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const MEASUREMENT_BASES = ['MEASURED', 'ESTIMATED'] as const;
export type MeasurementBasis = (typeof MEASUREMENT_BASES)[number];

export const MEASUREMENT_METHODS = [
  'METERED',
  'CALCULATED',
  'ENGINEERING_ESTIMATE',
  'OTHER',
] as const;
export type MeasurementMethod = (typeof MEASUREMENT_METHODS)[number];

export const ACTIVITY_RECORD_STATUSES = ['DRAFT', 'WITHDRAWN'] as const;
export type ActivityRecordStatus = (typeof ACTIVITY_RECORD_STATUSES)[number];

export const RATE_UNITS = ['MMSCF_PER_DAY', 'SM3_PER_DAY', 'MMSM3_PER_DAY'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const VOLUME_UNITS = ['MMSCF', 'BCF', 'SM3', 'MMSM3'] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

export const TEMPERATURE_UNITS = ['CELSIUS', 'FAHRENHEIT', 'KELVIN'] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/** Absolute pressure only; gauge pressure is not accepted. */
export const PRESSURE_UNITS = ['KPA_ABS', 'BAR_ABS', 'PSIA'] as const;
export type PressureUnit = (typeof PRESSURE_UNITS)[number];

/** Display labels. Units are labels only; conversions happen on the server. */
export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  MMSCF_PER_DAY: 'MMscf/d',
  SM3_PER_DAY: 'Sm³/d',
  MMSM3_PER_DAY: 'MMSm³/d',
};
export const VOLUME_UNIT_LABELS: Record<VolumeUnit, string> = {
  MMSCF: 'MMscf',
  BCF: 'Bcf',
  SM3: 'Sm³',
  MMSM3: 'MMSm³',
};
export const TEMPERATURE_UNIT_LABELS: Record<TemperatureUnit, string> = {
  CELSIUS: '°C',
  FAHRENHEIT: '°F',
  KELVIN: 'K',
};
export const PRESSURE_UNIT_LABELS: Record<PressureUnit, string> = {
  KPA_ABS: 'kPa(a)',
  BAR_ABS: 'bar(a)',
  PSIA: 'psia',
};

/** The platform's canonical reference condition (ISO 13443). */
export const CANONICAL_REFERENCE = {
  label: 'ISO 13443 (15 °C, 101.325 kPa)',
  temperature: { value: '15', unit: 'CELSIUS' },
  pressure: { value: '101.325', unit: 'KPA_ABS' },
} as const satisfies {
  label: string;
  temperature: { value: string; unit: TemperatureUnit };
  pressure: { value: string; unit: PressureUnit };
};

export interface QuantityInput<U extends string> {
  /** Decimal string exactly as entered, e.g. "0.250". */
  value: string;
  unit: U;
}

/** A measured or entered quantity: the exact value, its unit, and the text as entered. */
export interface QuantityDto<U extends string> {
  value: string;
  unit: U;
  entered: string;
}

export type ActivityWarningCode = 'OVERLAP' | 'RATE_VOLUME_MISMATCH' | 'NO_EVIDENCE';

export interface ActivityWarning {
  code: ActivityWarningCode;
  message: string;
  /** OVERLAP: the overlapping records. */
  overlapping?: { id: string; periodStart: string; periodEnd: string }[];
  /** RATE_VOLUME_MISMATCH: relative difference in percent, as a decimal string. */
  differencePercent?: string;
}

export interface ActivityRecordDto {
  id: string;
  organisationId: string;
  flareSourceId: string;
  kind: ActivityRecordKind;
  activityType: ActivityType;
  otherTypeDescription: string | null;
  /** Inclusive local dates (YYYY-MM-DD) in timeZone. */
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  averageRate: QuantityDto<RateUnit> | null;
  totalVolume: QuantityDto<VolumeUnit> | null;
  /** Actual operating duration in hours. */
  operatingHours: { value: string; entered: string } | null;
  referenceTemperature: QuantityDto<TemperatureUnit>;
  referencePressure: QuantityDto<PressureUnit>;
  zSource: { value: string; entered: string } | null;
  zReference: { value: string; entered: string } | null;
  /** Where the Z values come from; null when there are none or no source was given. */
  compressibilitySource: string | null;
  measurementBasis: MeasurementBasis;
  estimateExplanation: string | null;
  measurementMethod: MeasurementMethod;
  methodDescription: string | null;
  dataSource: 'MANUAL';
  notes: string | null;
  /** Standardised to the canonical condition (CANONICAL_REFERENCE). */
  standardised: {
    referenceCondition: string;
    averageRateMmscfd: string | null;
    totalVolumeMmscf: string | null;
    /** rate × operating hours / 24; only when both are present. */
    derivedVolumeMmscf: string | null;
    correctionFactor: string;
    conversionVersion: string;
    standardisedAt: string;
  };
  status: ActivityRecordStatus;
  withdrawal: { at: string; byId: string; reason: string } | null;
  overlapAcknowledgedAt: string | null;
  /** Data-quality warnings, worked out when the record is read. Empty for withdrawn records. */
  warnings: ActivityWarning[];
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
}

/** 409 OVERLAP_UNCONFIRMED: resend with acknowledgeOverlap: true to save anyway. */
export const OVERLAP_UNCONFIRMED_CODE = 'OVERLAP_UNCONFIRMED';

export interface OverlapErrorDetails {
  overlapping: { id: string; periodStart: string; periodEnd: string }[];
}

export interface DefaultCompressibilityDto {
  /** Z at the default reference condition. */
  zSource: string;
  /** Z at the canonical condition (15 °C, 101.325 kPa). */
  zReference: string;
  /** Where the values come from (e.g. a gas analysis report and its date). */
  source: string;
}

export interface OrganisationSettingsDto {
  defaultReferenceTemperature: { value: string; unit: TemperatureUnit };
  defaultReferencePressure: { value: string; unit: PressureUnit };
  /**
   * Compressibility factors for records at the default condition, with their source.
   * Only when the default differs from the canonical condition; they prefill records.
   */
  defaultCompressibility: DefaultCompressibilityDto | null;
}

/** PATCH /settings. A null defaultCompressibility removes it. */
export interface OrganisationSettingsUpdate {
  defaultReferenceTemperature?: { value: string; unit: TemperatureUnit };
  defaultReferencePressure?: { value: string; unit: PressureUnit };
  defaultCompressibility?: DefaultCompressibilityDto | null;
}
