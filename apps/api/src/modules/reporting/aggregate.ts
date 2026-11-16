import {
  ACTIVITY_TYPES,
  type ActivityRecordStatus,
  type ActivityType,
  type ActivityTypeRowDto,
  type AssetReportDto,
  type CalculationRoute,
  type DataQuality,
  type DayCoverageDto,
  type EmissionsTotalsDto,
  type FacilityReportDto,
  type FlareSourceReportDto,
  type ReportCalculationDto,
  type ReportCoverageDto,
  type ReportPeriodDto,
  type ReportSectionDto,
  type UnplacedRecordDto,
} from '@flame/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { addDays, daysBetween, daysElapsed } from './period.js';

/**
 * Pure aggregation of report rows (ARCHITECTURAL_WORKFLOW.md §8.2). No database access, so
 * the placement, inclusion and summing rules can be tested directly.
 *
 * Sums are exact: every stored value has at most 20 decimal places and 20 integer digits,
 * and 80 significant digits leave room for any realistic number of additions, so no
 * rounding ever happens here. Rounding is for display only.
 */
const D = Prisma.Decimal.clone({ precision: 80, rounding: Prisma.Decimal.ROUND_HALF_EVEN });
type Dec = InstanceType<typeof D>;

export interface ReportCalculationRow {
  id: string;
  version: number;
  route: CalculationRoute;
  editionId: string;
  edition: number;
  dataQuality: DataQuality;
  co2Tonnes: string;
  ch4Tonnes: string;
  n2oTonnes: string | null;
  co2eTonnes: string;
  approvedAt: string;
}

export interface ReportRecordRow {
  id: string;
  activityType: ActivityType;
  periodStart: string;
  periodEnd: string;
  status: ActivityRecordStatus;
  revisionOfId: string | null;
  /** Standardised total volume, else derived volume (MMscf); null when neither exists. */
  volumeMmscf: string | null;
  facility: { id: string; name: string; code: string; timeZone: string };
  asset: { id: string; name: string; code: string };
  flareSource: { id: string; name: string; code: string };
  /** The record's approved calculation, if any (at most one is approved at a time). */
  approvedCalculation: ReportCalculationRow | null;
  /** Calculations of this record not yet approved, rejected, discarded or superseded. */
  calculationsInProgress: number;
}

/** Records that are neither approved nor closed: still moving through the workflow. */
const NOT_YET_APPROVED: readonly ActivityRecordStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'AWAITING_APPROVAL',
];

/** A record counts in a period only when it lies wholly inside it. */
export function isPlaced(
  record: { periodStart: string; periodEnd: string },
  period: ReportPeriodDto,
) {
  return record.periodStart >= period.start && record.periodEnd <= period.end;
}

class EmissionsSum {
  count = 0;
  co2: Dec = new D(0);
  ch4: Dec = new D(0);
  n2o: Dec | null = null;
  co2e: Dec = new D(0);
  measured: Dec = new D(0);
  estimated: Dec = new D(0);
  volume: Dec = new D(0);

  add(calc: ReportCalculationRow, volumeMmscf: string): void {
    this.count += 1;
    this.co2 = this.co2.plus(calc.co2Tonnes);
    this.ch4 = this.ch4.plus(calc.ch4Tonnes);
    if (calc.n2oTonnes !== null) this.n2o = (this.n2o ?? new D(0)).plus(calc.n2oTonnes);
    this.co2e = this.co2e.plus(calc.co2eTonnes);
    if (calc.dataQuality === 'MEASURED_BASIS') this.measured = this.measured.plus(calc.co2eTonnes);
    else this.estimated = this.estimated.plus(calc.co2eTonnes);
    this.volume = this.volume.plus(volumeMmscf);
  }

  merge(other: EmissionsSum): void {
    this.count += other.count;
    this.co2 = this.co2.plus(other.co2);
    this.ch4 = this.ch4.plus(other.ch4);
    if (other.n2o !== null) this.n2o = (this.n2o ?? new D(0)).plus(other.n2o);
    this.co2e = this.co2e.plus(other.co2e);
    this.measured = this.measured.plus(other.measured);
    this.estimated = this.estimated.plus(other.estimated);
    this.volume = this.volume.plus(other.volume);
  }

  dto(): EmissionsTotalsDto | null {
    if (this.count === 0) return null;
    return {
      calculationCount: this.count,
      co2Tonnes: this.co2.toFixed(),
      ch4Tonnes: this.ch4.toFixed(),
      n2oTonnes: this.n2o === null ? null : this.n2o.toFixed(),
      co2eTonnes: this.co2e.toFixed(),
      measuredBasisCo2eTonnes: this.measured.toFixed(),
      estimatedCo2eTonnes: this.estimated.toFixed(),
      volumeCalculatedMmscf: this.volume.toFixed(),
    };
  }
}

class TypeBucket {
  emissions = new EmissionsSum();
  approvedVolume: Dec | null = null;
  coverage: ReportCoverageDto = {
    approvedRecords: 0,
    approvedRecordsCalculated: 0,
    approvedRecordsAwaitingCalculation: 0,
    calculationsInProgress: 0,
    recordsNotYetApproved: 0,
    openRevisions: 0,
    approvedRecordsWithoutVolume: 0,
  };

  add(record: ReportRecordRow): void {
    const c = this.coverage;
    if (record.status === 'APPROVED') {
      c.approvedRecords += 1;
      c.calculationsInProgress += record.calculationsInProgress;
      if (record.volumeMmscf === null) c.approvedRecordsWithoutVolume += 1;
      else this.approvedVolume = (this.approvedVolume ?? new D(0)).plus(record.volumeMmscf);
      if (record.approvedCalculation && record.volumeMmscf !== null) {
        c.approvedRecordsCalculated += 1;
        this.emissions.add(record.approvedCalculation, record.volumeMmscf);
      } else {
        c.approvedRecordsAwaitingCalculation += 1;
      }
    } else if (NOT_YET_APPROVED.includes(record.status)) {
      if (record.revisionOfId === null) c.recordsNotYetApproved += 1;
      else c.openRevisions += 1;
    }
  }

  merge(other: TypeBucket): void {
    this.emissions.merge(other.emissions);
    if (other.approvedVolume !== null) {
      this.approvedVolume = (this.approvedVolume ?? new D(0)).plus(other.approvedVolume);
    }
    for (const key of Object.keys(this.coverage) as (keyof ReportCoverageDto)[]) {
      this.coverage[key] += other.coverage[key];
    }
  }
}

/** Per-activity-type buckets; types are kept apart and only tCO₂e is totalled across them. */
class Section {
  readonly types = new Map<ActivityType, TypeBucket>();

  bucket(type: ActivityType): TypeBucket {
    let b = this.types.get(type);
    if (!b) {
      b = new TypeBucket();
      this.types.set(type, b);
    }
    return b;
  }

  merge(other: Section): void {
    for (const [type, b] of other.types) this.bucket(type).merge(b);
  }

  dto(): ReportSectionDto {
    const total = new EmissionsSum();
    const byType: ActivityTypeRowDto[] = ACTIVITY_TYPES.filter((t) => this.types.has(t)).map(
      (type) => {
        const b = this.bucket(type);
        total.merge(b.emissions);
        return {
          activityType: type,
          emissions: b.emissions.dto(),
          approvedVolumeMmscf: b.approvedVolume === null ? null : b.approvedVolume.toFixed(),
          coverage: { ...b.coverage },
        };
      },
    );
    return { byType, total: total.dto() };
  }
}

export interface AggregateResult {
  summary: ReportSectionDto;
  facilities: FacilityReportDto[];
  calculations: ReportCalculationDto[];
  unplaced: UnplacedRecordDto[];
}

const byCode = <T extends { code: string }>(a: T, b: T) => a.code.localeCompare(b.code);

/** Distinct calendar days covered by a set of inclusive date ranges. */
export function coveredDays(ranges: { start: string; end: string }[]): number {
  const days = new Set<string>();
  for (const r of ranges) {
    const n = daysBetween(r.start, r.end);
    for (let i = 0; i < n; i += 1) days.add(addDays(r.start, i));
  }
  return days.size;
}

/**
 * Builds a report from the records that overlap the period (any status except withdrawn,
 * rejected and superseded). `today(timeZone)` gives the current date in a facility's
 * time zone, for day coverage.
 */
export function aggregate(
  records: readonly ReportRecordRow[],
  period: ReportPeriodDto,
  today: (timeZone: string) => string,
): AggregateResult {
  const summary = new Section();
  const facilities = new Map<
    string,
    {
      info: ReportRecordRow['facility'];
      section: Section;
      assets: Map<
        string,
        {
          info: ReportRecordRow['asset'];
          section: Section;
          sources: Map<
            string,
            {
              info: ReportRecordRow['flareSource'];
              section: Section;
              days: Map<ActivityType, { start: string; end: string }[]>;
            }
          >;
        }
      >;
    }
  >();
  const calculations: ReportCalculationDto[] = [];
  const unplaced: UnplacedRecordDto[] = [];

  for (const record of records) {
    if (!isPlaced(record, period)) {
      if (record.status === 'APPROVED') {
        unplaced.push({
          activityRecordId: record.id,
          facilityCode: record.facility.code,
          flareSourceCode: record.flareSource.code,
          flareSourceName: record.flareSource.name,
          activityType: record.activityType,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          co2eTonnes: record.approvedCalculation?.co2eTonnes ?? null,
        });
      }
      continue;
    }

    let facility = facilities.get(record.facility.id);
    if (!facility) {
      facility = { info: record.facility, section: new Section(), assets: new Map() };
      facilities.set(record.facility.id, facility);
    }
    let asset = facility.assets.get(record.asset.id);
    if (!asset) {
      asset = { info: record.asset, section: new Section(), sources: new Map() };
      facility.assets.set(record.asset.id, asset);
    }
    let source = asset.sources.get(record.flareSource.id);
    if (!source) {
      source = { info: record.flareSource, section: new Section(), days: new Map() };
      asset.sources.set(record.flareSource.id, source);
    }

    source.section.bucket(record.activityType).add(record);
    if (record.status === 'APPROVED') {
      const ranges = source.days.get(record.activityType) ?? [];
      ranges.push({ start: record.periodStart, end: record.periodEnd });
      source.days.set(record.activityType, ranges);
    }

    const calc = record.approvedCalculation;
    if (record.status === 'APPROVED' && calc && record.volumeMmscf !== null) {
      calculations.push({
        id: calc.id,
        version: calc.version,
        activityRecordId: record.id,
        facilityCode: record.facility.code,
        assetCode: record.asset.code,
        flareSourceId: record.flareSource.id,
        flareSourceCode: record.flareSource.code,
        activityType: record.activityType,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        route: calc.route,
        editionId: calc.editionId,
        edition: calc.edition,
        dataQuality: calc.dataQuality,
        co2Tonnes: calc.co2Tonnes,
        ch4Tonnes: calc.ch4Tonnes,
        n2oTonnes: calc.n2oTonnes,
        co2eTonnes: calc.co2eTonnes,
        volumeMmscf: record.volumeMmscf,
        approvedAt: calc.approvedAt,
      });
    }
  }

  const facilityDtos: FacilityReportDto[] = [];
  for (const facility of facilities.values()) {
    const elapsed = daysElapsed(period.start, period.end, today(facility.info.timeZone));
    const assetDtos: AssetReportDto[] = [];
    for (const asset of facility.assets.values()) {
      const sourceDtos: FlareSourceReportDto[] = [];
      for (const source of asset.sources.values()) {
        asset.section.merge(source.section);
        const dayCoverage: DayCoverageDto[] = ACTIVITY_TYPES.filter((t) =>
          source.section.types.has(t),
        ).map((activityType) => ({
          activityType,
          daysCovered: coveredDays(source.days.get(activityType) ?? []),
          daysElapsed: elapsed,
        }));
        sourceDtos.push({ ...source.info, ...source.section.dto(), dayCoverage });
      }
      facility.section.merge(asset.section);
      assetDtos.push({
        ...asset.info,
        ...asset.section.dto(),
        flareSources: sourceDtos.sort(byCode),
      });
    }
    summary.merge(facility.section);
    facilityDtos.push({
      ...facility.info,
      ...facility.section.dto(),
      assets: assetDtos.sort(byCode),
    });
  }

  calculations.sort(
    (a, b) =>
      a.periodStart.localeCompare(b.periodStart) ||
      a.facilityCode.localeCompare(b.facilityCode) ||
      a.flareSourceCode.localeCompare(b.flareSourceCode) ||
      a.activityType.localeCompare(b.activityType),
  );
  unplaced.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  return {
    summary: summary.dto(),
    facilities: facilityDtos.sort(byCode),
    calculations,
    unplaced,
  };
}
