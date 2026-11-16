/**
 * Emissions reporting (Milestone 5): live monthly, quarterly and annual totals built only
 * from approved calculations. Rules: docs/architecture/ARCHITECTURAL_WORKFLOW.md §8.2.
 *
 * Every figure is an exact decimal string computed by the API. tCO₂e is an emissions
 * figure: it is not a carbon credit and never creates one.
 */
import type { ActivityType } from './activity.js';
import type { CalculationRoute, DataQuality } from './calculations.js';

export const REPORT_GRANULARITIES = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

/** Period keys: "2026-03" (month), "2026-Q1" (calendar quarter), "2026" (calendar year). */
export const REPORT_PERIOD_PATTERN = /^(\d{4})(?:-(0[1-9]|1[0-2])|-Q([1-4]))?$/;

/** The label every report carries, on screen, in print and in the CSV. */
export const REPORT_BASIS_LABEL =
  'Emissions (tCO₂e). Approved calculations only. Not carbon credits.';

export interface ReportPeriodDto {
  granularity: ReportGranularity;
  key: string;
  label: string;
  /** Inclusive calendar dates, YYYY-MM-DD. */
  start: string;
  end: string;
  days: number;
}

export interface ReportFilters {
  facilityId: string | null;
  activityType: ActivityType | null;
}

/** Sums of the approved calculations that count (exact decimal strings). */
export interface EmissionsTotalsDto {
  calculationCount: number;
  co2Tonnes: string;
  ch4Tonnes: string;
  /** Null when no contributing calculation has N₂O (venting only): not applicable, not 0. */
  n2oTonnes: string | null;
  co2eTonnes: string;
  measuredBasisCo2eTonnes: string;
  estimatedCo2eTonnes: string;
  /** The volume behind these calculations, MMscf at the canonical condition. */
  volumeCalculatedMmscf: string;
}

/** What is missing or still moving through review, for the records placed in the period. */
export interface ReportCoverageDto {
  /** Approved activity records placed in the period. */
  approvedRecords: number;
  /** Of those, records with an approved calculation (they make up the emissions). */
  approvedRecordsCalculated: number;
  /** Approved records without an approved calculation. */
  approvedRecordsAwaitingCalculation: number;
  /** Calculations not yet approved (calculated, submitted, in review, awaiting approval). */
  calculationsInProgress: number;
  /** Records still in the activity workflow (draft to awaiting approval), not revisions. */
  recordsNotYetApproved: number;
  /** Open revisions of approved records; the approved original keeps counting meanwhile. */
  openRevisions: number;
  /** Approved records with a rate but no operating hours, so no volume. */
  approvedRecordsWithoutVolume: number;
}

export interface ActivityTypeRowDto {
  activityType: ActivityType;
  /** Null when no approved calculation counts for this type in the period. */
  emissions: EmissionsTotalsDto | null;
  /** All approved records' volume (MMscf, canonical condition); null when none has one. */
  approvedVolumeMmscf: string | null;
  coverage: ReportCoverageDto;
}

/**
 * Emissions summed across activity types. It has no volume: flared and vented gas (and
 * the flaring types) are never added together as one volume (§8.2).
 */
export type CrossTypeTotalDto = Omit<EmissionsTotalsDto, 'volumeCalculatedMmscf'>;

export interface ReportSectionDto {
  byType: ActivityTypeRowDto[];
  /** The sum of the per-type emissions above (no volume); null when there are none. */
  total: CrossTypeTotalDto | null;
}

export interface DayCoverageDto {
  activityType: ActivityType;
  /** Distinct days covered by approved records placed in the period. */
  daysCovered: number;
  /** Days of the period up to today (in the facility's time zone). */
  daysElapsed: number;
}

export interface FlareSourceReportDto extends ReportSectionDto {
  id: string;
  name: string;
  code: string;
  dayCoverage: DayCoverageDto[];
}

export interface AssetReportDto extends ReportSectionDto {
  id: string;
  name: string;
  code: string;
  flareSources: FlareSourceReportDto[];
}

export interface FacilityReportDto extends ReportSectionDto {
  id: string;
  name: string;
  code: string;
  timeZone: string;
  assets: AssetReportDto[];
}

export interface ReportEditionDto {
  id: string;
  code: string;
  edition: number;
  title: string;
  gwp: { co2: string | null; ch4: string | null; n2o: string | null };
  calculationCount: number;
}

/** One approved calculation included in the totals. */
export interface ReportCalculationDto {
  id: string;
  version: number;
  activityRecordId: string;
  facilityCode: string;
  assetCode: string;
  flareSourceId: string;
  flareSourceCode: string;
  activityType: ActivityType;
  periodStart: string;
  periodEnd: string;
  route: CalculationRoute;
  editionId: string;
  edition: number;
  dataQuality: DataQuality;
  co2Tonnes: string;
  ch4Tonnes: string;
  n2oTonnes: string | null;
  co2eTonnes: string;
  volumeMmscf: string;
  approvedAt: string;
}

/** An approved record that crosses the period boundary, so it isn't in this period. */
export interface UnplacedRecordDto {
  activityRecordId: string;
  facilityCode: string;
  flareSourceCode: string;
  flareSourceName: string;
  activityType: ActivityType;
  periodStart: string;
  periodEnd: string;
  /** Its approved calculation's tCO₂e, when it has one. */
  co2eTonnes: string | null;
}

export interface EmissionsReportDto {
  basis: string;
  organisation: { id: string; name: string };
  period: ReportPeriodDto;
  filters: ReportFilters;
  /** The filtered facility, when there is a facility filter. */
  facility: { id: string; name: string; code: string } | null;
  generatedAt: string;
  /** Canonical condition of every volume. */
  referenceCondition: string;
  summary: ReportSectionDto;
  facilities: FacilityReportDto[];
  editions: ReportEditionDto[];
  /** False when the contributing editions use different GWP values. */
  gwpConsistent: boolean;
  calculations: ReportCalculationDto[];
  unplaced: UnplacedRecordDto[];
}

export interface TrendMonthDto {
  key: string;
  label: string;
  /** tCO₂e per activity type; null when no approved calculation counts. */
  byType: Record<ActivityType, string | null>;
  total: string | null;
  /** True when part of the month's tCO₂e is estimated. */
  includesEstimated: boolean;
}

export interface EmissionsTrendDto {
  basis: string;
  filters: ReportFilters;
  months: TrendMonthDto[];
}
