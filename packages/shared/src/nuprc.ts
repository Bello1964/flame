import type { ActivityType, MeasurementBasis, VolumeUnit } from './activity.js';
import type { ReportEditionDto, ReportPeriodDto, UnplacedRecordDto } from './reporting.js';

/**
 * NUPRC reports (ARCHITECTURAL_WORKFLOW.md §8.3). Built from approved data only. Flame
 * produces the data parts of NUPRC's templates; it makes no claim of regulatory compliance.
 */

export const NUPRC_REPORT_KINDS = ['QUARTERLY_GHG_INVENTORY', 'MONTHLY_FLARE_VENT_LOG'] as const;
export type NuprcReportKind = (typeof NUPRC_REPORT_KINDS)[number];

export const NUPRC_REPORT_KIND_LABELS: Record<NuprcReportKind, string> = {
  QUARTERLY_GHG_INVENTORY: 'Quarterly GHG emissions inventory',
  MONTHLY_FLARE_VENT_LOG: 'Monthly flare and vent log',
};

/** Where the layout comes from, shown on every NUPRC report. */
export interface NuprcSourceDto {
  title: string;
  issuer: string;
  url: string | null;
  /** What Flame follows from it, and what it does not claim. */
  note: string;
}

export type NuprcEmissionSource = 'Flaring' | 'Venting';

/**
 * Appendix C of NUPRC's "Guidance Template for GHG Emissions Inventory Reporting in
 * Upstream Oil and Gas Operations" (2026): the column headings, in order, as published.
 */
export const NUPRC_APPENDIX_C_COLUMNS = [
  'S/N',
  'YEAR',
  'MONTH',
  'COMPANY NAME',
  'COMPANY ABR',
  'LOCATION (Terrain)',
  'CONCESSION',
  'FIELD NAME',
  'FACILITY NAME',
  'FACILITY TYPE',
  'FACILITY COORDINATES',
  'FRAMEWORK ADOPTED (Indicate Tier or Level)',
  'EMISSION SOURCES',
  'EQUIPMENT/SOURCE TYPE',
  'UNIT (Tonnes CO2e)',
  'CO2',
  'CH4',
  'N2O',
  'TOTAL In tonnes CO2e',
  'COMMENTS',
] as const;

/** One Appendix C row: a month, facility, emission source and equipment type. */
export interface NuprcAppendixCRowDto {
  serial: number;
  year: string;
  /** Month name, e.g. "January". */
  month: string;
  companyName: string;
  companyAbbreviation: string | null;
  terrain: string | null;
  concession: string | null;
  fieldName: string | null;
  facilityId: string;
  facilityName: string;
  facilityType: string | null;
  /** "latitude, longitude" in decimal degrees, or null. */
  coordinates: string | null;
  /** Tier labels set in the methodology editions used; null when none is set. */
  framework: string | null;
  emissionSource: NuprcEmissionSource;
  equipmentType: string;
  unit: 'Tonnes CO2e';
  /** tCO2e per gas: each calculation's gas tonnes × its edition's GWP, summed. */
  co2: string;
  ch4: string;
  /** Null when no calculation in the row has N2O (venting). */
  n2o: string | null;
  /** Sum of the approved calculations' tCO2e. */
  total: string;
  comments: string;
}

/** Appendix A: inventory of flaring and venting sources per facility. */
export interface NuprcAppendixARowDto {
  serial: number;
  facilityName: string;
  facilityType: string | null;
  location: string | null;
  sourceCategory: NuprcEmissionSource;
  equipmentType: string;
  quantity: number;
  segment: string | null;
  pollutants: string;
  quantificationMethod: string;
  uncertainty: string;
}

/** Emissions by gas per facility and source for the quarter (template section 7). */
export interface NuprcGasTotalsDto {
  facilityId: string;
  facilityName: string;
  emissionSource: NuprcEmissionSource;
  co2: string;
  ch4: string;
  n2o: string | null;
  total: string;
  calculationCount: number;
}

/** Activity data per facility and activity type for the quarter (template section 4). */
export interface NuprcActivityTotalsDto {
  facilityId: string;
  facilityName: string;
  activityType: ActivityType;
  /** All approved records placed in the quarter (MMscf). */
  approvedVolumeMmscf: string;
  /** Approved records that also have an approved calculation (MMscf). */
  volumeCalculatedMmscf: string;
  recordCount: number;
}

export interface NuprcCoverageDto {
  /** Approved records placed in the period. */
  approvedRecords: number;
  /** Approved records placed in the period with no approved calculation yet. */
  withoutApprovedCalculation: number;
  /** Records placed in the period not yet approved (draft or in review): not included. */
  awaitingApproval: number;
}

export interface NuprcQuarterlyReportDto {
  kind: 'QUARTERLY_GHG_INVENTORY';
  source: NuprcSourceDto;
  organisation: { id: string; name: string; abbreviation: string | null };
  period: ReportPeriodDto;
  generatedAt: string;
  appendixC: NuprcAppendixCRowDto[];
  appendixA: NuprcAppendixARowDto[];
  gasTotals: NuprcGasTotalsDto[];
  activityTotals: NuprcActivityTotalsDto[];
  editions: ReportEditionDto[];
  /** False when the editions used have different GWP values. */
  gwpConsistent: boolean;
  coverage: NuprcCoverageDto;
  /** Records overlapping the quarter but not wholly inside it: not counted. */
  unplaced: UnplacedRecordDto[];
  /** Template items Flame does not record (e.g. combustion, fugitives, intensity). */
  notRecorded: string[];
  notes: string[];
}

/** One flaring or venting entry of the monthly log (NUPRC Regulations 2023, reg. 20(4)). */
export interface NuprcMonthlyLogEntryDto {
  recordId: string;
  facilityName: string;
  flareSourceName: string;
  flareSourceCode: string;
  emissionSource: NuprcEmissionSource;
  activityType: ActivityType;
  /** Inclusive local dates. */
  periodStart: string;
  periodEnd: string;
  /** "HH:MM" local time, or null when not recorded. */
  startTime: string | null;
  durationHours: string | null;
  /** Standardised average rate (MMscf/d). */
  rateMmscfd: string | null;
  /** Standardised volume (MMscf). */
  volumeMmscf: string | null;
  /** The volume as entered, with its unit. */
  originalVolume: { value: string; unit: VolumeUnit } | null;
  gasSource: string | null;
  measurementBasis: MeasurementBasis;
  /**
   * The event crosses a month boundary: listed in every month it touches, and not in any
   * month's totals (volumes are never split).
   */
  spansMonths: boolean;
  /** Venting only: CH4 in tCO2e from the record's approved calculation, if any. */
  ch4Co2e: string | null;
}

export interface NuprcMonthlySourceTotalDto {
  flareSourceId: string;
  flareSourceName: string;
  flareSourceCode: string;
  facilityName: string;
  flaredMmscf: string;
  ventedMmscf: string;
}

export interface NuprcMonthlyLogDto {
  kind: 'MONTHLY_FLARE_VENT_LOG';
  source: NuprcSourceDto;
  organisation: { id: string; name: string; abbreviation: string | null };
  period: ReportPeriodDto;
  generatedAt: string;
  entries: NuprcMonthlyLogEntryDto[];
  sourceTotals: NuprcMonthlySourceTotalDto[];
  totals: { flaredMmscf: string; ventedMmscf: string };
  coverage: NuprcCoverageDto;
  unplaced: UnplacedRecordDto[];
  notRecorded: string[];
  notes: string[];
}

export type NuprcReportDto = NuprcQuarterlyReportDto | NuprcMonthlyLogDto;

// ─── Issued (frozen) reports ─────────────────────────────────────────────────

export const ISSUED_REPORT_STATUSES = [
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type IssuedReportStatus = (typeof ISSUED_REPORT_STATUSES)[number];

export interface IssuedReportUserDto {
  id: string;
  name: string;
}

export interface IssuedReportSummaryDto {
  id: string;
  kind: NuprcReportKind;
  periodKey: string;
  periodLabel: string;
  version: number;
  status: IssuedReportStatus;
  /** Why this version was issued (required from version 2). */
  reason: string | null;
  issuedBy: IssuedReportUserDto;
  issuedAt: string;
  approvedBy: IssuedReportUserDto | null;
  approvedAt: string | null;
  rejectedBy: IssuedReportUserDto | null;
  rejectedAt: string | null;
  rejectionComment: string | null;
  supersededAt: string | null;
  /** YYYY-MM-DD; null until a submission to NUPRC is recorded. */
  submittedOn: string | null;
  submissionReference: string | null;
  submissionRecordedBy: IssuedReportUserDto | null;
  submissionRecordedAt: string | null;
}

export interface IssuedReportDto extends IssuedReportSummaryDto {
  /** The report exactly as issued. */
  snapshot: NuprcReportDto;
}

/** POST /reports/issued. `period`: "2026-Q3" (quarterly) or "2026-07" (monthly). */
export interface IssueReportRequest {
  kind: NuprcReportKind;
  period: string;
  /** Required when a version for the period was already issued. */
  reason?: string;
}

export interface RejectIssuedReportRequest {
  comment: string;
}

export interface RecordSubmissionRequest {
  /** YYYY-MM-DD, not in the future. */
  submittedOn: string;
  reference?: string;
}

export const ISSUED_REPORT_ERROR_CODES = {
  /** 409: a version for this period is already awaiting approval. */
  AWAITING_APPROVAL_EXISTS: 'ISSUED_REPORT_AWAITING_APPROVAL',
  /** 400: a reason is required for a new version. */
  REASON_REQUIRED: 'ISSUED_REPORT_REASON_REQUIRED',
} as const;
