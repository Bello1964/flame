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

/** Workflow states (ARCHITECTURAL_WORKFLOW.md §7.1). */
export const ACTIVITY_RECORD_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
  'WITHDRAWN',
] as const;
export type ActivityRecordStatus = (typeof ACTIVITY_RECORD_STATUSES)[number];

/** Values can be changed only in these states. */
export const EDITABLE_STATUSES = [
  'DRAFT',
  'NEEDS_CORRECTION',
] as const satisfies readonly ActivityRecordStatus[];

/** Submitted and not yet decided. */
export const IN_WORKFLOW_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_APPROVAL',
] as const satisfies readonly ActivityRecordStatus[];

/** No further changes are possible (an approved record can still be revised). */
export const CLOSED_STATUSES = [
  'REJECTED',
  'SUPERSEDED',
  'WITHDRAWN',
] as const satisfies readonly ActivityRecordStatus[];

/**
 * Actions on a record. The API lists the ones the requesting user may take on each
 * record in `availableActions`; it decides again on every request.
 */
export const ACTIVITY_ACTIONS = [
  'edit',
  'withdraw',
  'submit',
  'recall',
  'start-review',
  'release-claim',
  'forward',
  'return',
  'approve',
  'reject',
  'revise',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Workflow actions that can be applied to many records at once. */
export const BULK_ACTIVITY_ACTIONS = [
  'submit',
  'start-review',
  'forward',
  'return',
  'approve',
  'reject',
] as const satisfies readonly ActivityAction[];
export type BulkActivityAction = (typeof BULK_ACTIVITY_ACTIONS)[number];

/** Actions that require a comment (the reason is kept in the record history). */
export const COMMENT_REQUIRED_ACTIONS = [
  'withdraw',
  'release-claim',
  'return',
  'reject',
] as const satisfies readonly ActivityAction[];

export const ACTIVITY_EVENT_TYPES = [
  'CREATED',
  'EDITED',
  'SUBMITTED',
  'RECALLED',
  'REVIEW_STARTED',
  'CLAIM_RELEASED',
  'FORWARDED',
  'RETURNED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'REVISION_CREATED',
  'SUPERSEDED',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

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
  /** 1 for an original record; a revision has its predecessor's version + 1. */
  version: number;
  /** The approved record this one revises. */
  revisionOfId: string | null;
  /** An open (not yet approved, rejected or withdrawn) revision of this record. */
  openRevisionId: string | null;
  /** The approved revision that replaced this record (SUPERSEDED only). */
  supersededById: string | null;
  flareSource: { id: string; name: string; code: string; facilityName: string };
  submittedAt: string | null;
  /** The reviewer holding the record (UNDER_REVIEW only). */
  claim: { byId: string; byName: string; at: string } | null;
  approval: { at: string; byId: string; byName: string } | null;
  supersededAt: string | null;
  withdrawal: { at: string; byId: string; reason: string } | null;
  /** What the requesting user may do with this record now. */
  availableActions: ActivityAction[];
  /**
   * Why the requesting user can't review or approve this record, when their role
   * would otherwise allow it (e.g. they entered or edited it).
   */
  separationOfDuties: string | null;
  overlapAcknowledgedAt: string | null;
  /**
   * Data-quality warnings, worked out when the record is read. Empty for withdrawn,
   * rejected and superseded records.
   */
  warnings: ActivityWarning[];
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
}

/** One entry in a record's history. */
export interface ActivityRecordEventDto {
  id: string;
  type: ActivityEventType;
  fromStatus: ActivityRecordStatus | null;
  toStatus: ActivityRecordStatus;
  actor: { id: string; name: string };
  comment: string | null;
  /** Data-quality warnings recorded with a submission or approval. */
  warnings: ActivityWarning[] | null;
  /** The related record for REVISION_CREATED, SUPERSEDED and a revision's CREATED. */
  relatedRecordId: string | null;
  createdAt: string;
}

/** POST /activity-records/bulk */
export interface BulkActivityRequest {
  action: BulkActivityAction;
  ids: string[];
  comment?: string;
}

export type BulkActivityResult =
  | { id: string; ok: true; status: ActivityRecordStatus }
  | { id: string; ok: false; error: { code: string; message: string } };

/**
 * 409 OVERLAP_BLOCKED: the record overlaps a submitted, under-review, awaiting-approval
 * or approved record for the same flare source and activity type, so it can't be
 * submitted or approved. Details list the records (OverlapErrorDetails).
 */
export const OVERLAP_BLOCKED_CODE = 'OVERLAP_BLOCKED';

/**
 * 403 SEPARATION_OF_DUTIES: the user's role allows the action, but they were involved
 * in the record (or reviewed it) and so may not review or approve it.
 */
export const SEPARATION_OF_DUTIES_CODE = 'SEPARATION_OF_DUTIES';

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
