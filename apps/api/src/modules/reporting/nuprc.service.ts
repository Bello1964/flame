import {
  FACILITY_SEGMENT_LABELS,
  NUPRC_FACILITY_TYPE_LABELS,
  type ActivityType,
  type CalculationRoute,
  type MethodologyContent,
  type NuprcActivityTotalsDto,
  type NuprcAppendixARowDto,
  type NuprcAppendixCRowDto,
  type NuprcCoverageDto,
  type NuprcEmissionSource,
  type NuprcGasTotalsDto,
  type NuprcMonthlyLogDto,
  type NuprcMonthlyLogEntryDto,
  type NuprcMonthlySourceTotalDto,
  type NuprcQuarterlyReportDto,
  type NuprcSourceDto,
  type ReportEditionDto,
  type ReportPeriodDto,
  type UnplacedRecordDto,
} from '@flame/shared';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { isoDateOf } from '../activity/activity.repository.js';
import { isPlaced } from './aggregate.js';

/**
 * NUPRC reports (ARCHITECTURAL_WORKFLOW.md §8.3), built from approved data only: approved
 * activity records wholly inside the period (§8.2 placement) and their approved
 * calculations. Live: recomputed on every request; issuing freezes a copy.
 */

const D = Prisma.Decimal.clone({ precision: 80, rounding: Prisma.Decimal.ROUND_HALF_EVEN });
type Dec = InstanceType<typeof D>;

const NUPRC = 'Nigerian Upstream Petroleum Regulatory Commission (NUPRC)';

export const QUARTERLY_SOURCE: NuprcSourceDto = {
  title:
    'Guidance Template for Greenhouse Gas (GHG) Emissions Inventory Reporting in Upstream Oil and Gas Operations (2026)',
  issuer: NUPRC,
  url: 'https://www.nuprc.gov.ng/upload/nuprc_laws/Guidance_Template_for_Methane_and_GHG_Emissions_Inventory_Reporting_1781449714369.pdf',
  note: 'Appendix C follows the published column headings in order (submitted in NUPRC’s Excel template). Flame produces the data parts from approved records and approved calculations; the narrative sections are the operator’s. This report does not claim regulatory compliance or independent verification.',
};

export const MONTHLY_SOURCE: NuprcSourceDto = {
  title:
    'Gas Flaring, Venting and Methane Emissions (Prevention of Waste and Pollution) Regulations, 2023 — regulation 20',
  issuer: NUPRC,
  url: 'https://www.nuprc.gov.ng/upload/nuprc_laws/Gas_Flaring_Venting_and_Methane_Reg_2023_cd4e70a88c3295914a6466e9.pdf',
  note: 'Entries hold the items regulation 20(4) names (date, time, duration, rates, volumes, gas source or type), with monthly flare and vent totals (regulation 20(2)). The log format of NUPRC’s Metering and Data Collection Standards (regulation 20(7)) is not published and is not claimed. Logs are due within 21 days after the month ends (regulation 20(1)). This log does not claim regulatory compliance.',
};

const FLARING: readonly ActivityType[] = [
  'ROUTINE_FLARING',
  'NON_ROUTINE_FLARING',
  'EMERGENCY_FLARING',
];

export function emissionSourceOf(type: ActivityType): NuprcEmissionSource | null {
  if (type === 'VENTING') return 'Venting';
  return FLARING.includes(type) ? 'Flaring' : null;
}

const FLARE_TYPE_LABELS: Record<string, string> = {
  ELEVATED: 'Elevated',
  GROUND: 'Ground',
  ENCLOSED: 'Enclosed',
  OTHER: 'Other',
};

function equipmentTypeOf(source: NuprcEmissionSource, flareType: string | null): string {
  if (source === 'Venting') return 'Vent';
  const label = flareType ? FLARE_TYPE_LABELS[flareType] : undefined;
  return label ? `Flare Point (${label})` : 'Flare Point';
}

const TERRAIN_LABELS: Record<string, string> = { ONSHORE: 'Onshore', OFFSHORE: 'Offshore' };

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Statuses still moving through review and approval. */
const IN_WORKFLOW = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'AWAITING_APPROVAL'];

const QUARTERLY_NOT_RECORDED = [
  'Combustion (stationary and mobile)',
  'Fugitive emissions (equipment leaks, tanks)',
  'Other source categories in the template (process emissions, storage tanks, pneumatic devices, compressors, process heaters, cold vents, mobile combustion, well testing)',
  'Emission intensity (kg CO2e/boe): needs production data, which Flame does not record',
  'Uncertainty estimates: not quantified in Flame',
];

const MONTHLY_NOT_RECORDED = [
  'Monthly report of natural gas produced, utilised and disposed of (regulation 21): gas produced, gas-oil ratio, own use, offtake deliveries and the associated gas utilisation factor are not recorded in Flame',
];

type Row = Awaited<ReturnType<NuprcService['rows']>>[number];

interface EditionInfo {
  dto: Omit<ReportEditionDto, 'calculationCount'>;
  gwp: { co2: Dec | null; ch4: Dec | null; n2o: Dec | null };
  routes: Map<CalculationRoute, { title: string; tier: string | null }>;
}

class GasSum {
  co2: Dec = new D(0);
  ch4: Dec = new D(0);
  n2o: Dec | null = null;
  total: Dec = new D(0);
  count = 0;
  estimated = false;
  frameworks = new Set<string>();
  editionsWithoutTier = new Set<number>();
  editions = new Set<number>();

  add(row: Row, edition: EditionInfo): void {
    const calc = row.calculations[0];
    if (!calc) return;
    this.count += 1;
    if (edition.gwp.co2)
      this.co2 = this.co2.plus(new D(exact(calc.co2Tonnes)).times(edition.gwp.co2));
    if (edition.gwp.ch4)
      this.ch4 = this.ch4.plus(new D(exact(calc.ch4Tonnes)).times(edition.gwp.ch4));
    if (calc.n2oTonnes !== null && edition.gwp.n2o) {
      this.n2o = (this.n2o ?? new D(0)).plus(new D(exact(calc.n2oTonnes)).times(edition.gwp.n2o));
    }
    this.total = this.total.plus(exact(calc.co2eTonnes));
    if (calc.dataQuality === 'ESTIMATED') this.estimated = true;
    const tier = edition.routes.get(calc.route)?.tier ?? null;
    if (tier) this.frameworks.add(tier);
    else this.editionsWithoutTier.add(edition.dto.edition);
    this.editions.add(edition.dto.edition);
  }
}

const sorted = <T>(values: Iterable<T>) => [...values].sort();

export class NuprcService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Records of the organisation overlapping [start, end], with what NUPRC reports need. */
  async rows(organisationId: string, start: string, end: string) {
    return this.prisma.activityRecord.findMany({
      where: {
        organisationId,
        status: { notIn: ['WITHDRAWN', 'REJECTED', 'SUPERSEDED'] },
        periodStart: { lte: new Date(`${end}T00:00:00Z`) },
        periodEnd: { gte: new Date(`${start}T00:00:00Z`) },
      },
      orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        activityType: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        startTime: true,
        gasSource: true,
        operatingHours: true,
        standardRateMmscfd: true,
        standardVolumeMmscf: true,
        derivedVolumeMmscf: true,
        totalVolumeInput: true,
        volumeUnit: true,
        measurementBasis: true,
        flareSource: {
          select: {
            id: true,
            name: true,
            code: true,
            flareType: true,
            asset: {
              select: {
                facility: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    terrain: true,
                    concession: true,
                    fieldName: true,
                    facilityType: true,
                    segment: true,
                    latitude: true,
                    longitude: true,
                  },
                },
              },
            },
          },
        },
        calculations: {
          where: { status: 'APPROVED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            route: true,
            editionId: true,
            dataQuality: true,
            co2Tonnes: true,
            ch4Tonnes: true,
            n2oTonnes: true,
            co2eTonnes: true,
          },
        },
      },
    });
  }

  private async editions(ids: string[]): Promise<Map<string, EditionInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.methodologyEdition.findMany({
      where: { id: { in: ids } },
      orderBy: [{ code: 'asc' }, { edition: 'asc' }],
      select: {
        id: true,
        code: true,
        edition: true,
        title: true,
        content: true,
        parameters: {
          where: { key: { in: ['gwp.co2', 'gwp.ch4', 'gwp.n2o'] } },
          select: { key: true, value: true },
        },
      },
    });
    return new Map(
      rows.map((e) => {
        const value = (key: string) => {
          const p = e.parameters.find((x) => x.key === key);
          return p ? exact(p.value) : null;
        };
        const content = e.content as unknown as MethodologyContent;
        const routes = new Map(
          content.routes.map((r) => [
            r.key,
            { title: r.title, tier: r.reportingTier?.label ?? null },
          ]),
        );
        const gwp = { co2: value('gwp.co2'), ch4: value('gwp.ch4'), n2o: value('gwp.n2o') };
        return [
          e.id,
          {
            dto: { id: e.id, code: e.code, edition: e.edition, title: e.title, gwp },
            gwp: {
              co2: gwp.co2 === null ? null : new D(gwp.co2),
              ch4: gwp.ch4 === null ? null : new D(gwp.ch4),
              n2o: gwp.n2o === null ? null : new D(gwp.n2o),
            },
            routes,
          },
        ];
      }),
    );
  }

  private async organisation(organisationId: string) {
    return this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { id: true, name: true, abbreviation: true },
    });
  }

  private placedIn(rows: Row[], period: ReportPeriodDto) {
    const span = (r: Row) => ({
      periodStart: isoDateOf(r.periodStart),
      periodEnd: isoDateOf(r.periodEnd),
    });
    const approved = rows.filter((r) => r.status === 'APPROVED');
    const placed = approved.filter((r) => isPlaced(span(r), period));
    const unplaced: UnplacedRecordDto[] = approved
      .filter((r) => !isPlaced(span(r), period))
      .map((r) => ({
        activityRecordId: r.id,
        facilityCode: r.flareSource.asset.facility.code,
        flareSourceCode: r.flareSource.code,
        flareSourceName: r.flareSource.name,
        activityType: r.activityType,
        periodStart: isoDateOf(r.periodStart),
        periodEnd: isoDateOf(r.periodEnd),
        co2eTonnes: r.calculations[0] ? exact(r.calculations[0].co2eTonnes) : null,
      }));
    const coverage: NuprcCoverageDto = {
      approvedRecords: placed.length,
      withoutApprovedCalculation: placed.filter(
        (r) => emissionSourceOf(r.activityType) !== null && r.calculations.length === 0,
      ).length,
      awaitingApproval: rows.filter(
        (r) => IN_WORKFLOW.includes(r.status) && isPlaced(span(r), period),
      ).length,
    };
    return { placed, unplaced, coverage };
  }

  // ─── Quarterly GHG inventory ───────────────────────────────────────────────

  async quarterly(
    organisationId: string,
    period: ReportPeriodDto,
  ): Promise<NuprcQuarterlyReportDto> {
    if (period.granularity !== 'QUARTER') throw new Error('A quarter is required');
    const organisation = await this.organisation(organisationId);
    const rows = await this.rows(organisationId, period.start, period.end);
    const { placed, unplaced, coverage } = this.placedIn(rows, period);
    const editions = await this.editions([
      ...new Set(placed.flatMap((r) => r.calculations.map((c) => c.editionId))),
    ]);
    const editionOf = (r: Row) => {
      const calc = r.calculations[0];
      return calc ? editions.get(calc.editionId) : undefined;
    };

    const year = Number(period.start.slice(0, 4));

    /**
     * The Appendix C month of a record: its calendar month, or, for a record that crosses
     * a month boundary inside the quarter, the span of months (e.g. "July–August"). Such a
     * record gets its own row and is never split between months (decision 2026-11-20).
     */
    const monthOf = (r: Row) => {
      const start = Number(isoDateOf(r.periodStart).slice(5, 7));
      const end = Number(isoDateOf(r.periodEnd).slice(5, 7));
      const name = (m: number) => MONTH_NAMES[m - 1] ?? String(m);
      return start === end
        ? { key: String(start).padStart(2, '0'), name: name(start), spans: false }
        : {
            key: `${String(start).padStart(2, '0')}~${String(end).padStart(2, '0')}`,
            name: `${name(start)}–${name(end)}`,
            spans: true,
          };
    };

    // Appendix C: month (or span) × facility × emission source × equipment type.
    const cRows = new Map<
      string,
      {
        month: ReturnType<typeof monthOf>;
        row: Row;
        source: NuprcEmissionSource;
        equipment: string;
        sum: GasSum;
      }
    >();
    let crossMonth = 0;
    for (const r of placed) {
      const source = emissionSourceOf(r.activityType);
      const edition = editionOf(r);
      if (!source || !edition) continue;
      const month = monthOf(r);
      if (month.spans) crossMonth += 1;
      const equipment = equipmentTypeOf(source, r.flareSource.flareType);
      const key = [month.key, r.flareSource.asset.facility.id, source, equipment].join('|');
      let entry = cRows.get(key);
      if (!entry) {
        entry = { month, row: r, source, equipment, sum: new GasSum() };
        cRows.set(key, entry);
      }
      entry.sum.add(r, edition);
    }

    const appendixC: NuprcAppendixCRowDto[] = [...cRows.values()]
      .sort(
        (a, b) =>
          a.month.key.localeCompare(b.month.key) ||
          a.row.flareSource.asset.facility.name.localeCompare(
            b.row.flareSource.asset.facility.name,
          ) ||
          a.source.localeCompare(b.source) ||
          a.equipment.localeCompare(b.equipment),
      )
      .map((entry, index) => {
        const f = entry.row.flareSource.asset.facility;
        const missing: string[] = [];
        if (!organisation.abbreviation) missing.push('company abbreviation');
        if (!f.terrain) missing.push('terrain');
        if (!f.concession) missing.push('concession');
        if (!f.fieldName) missing.push('field name');
        if (!f.facilityType) missing.push('facility type');
        if (f.latitude === null || f.longitude === null) missing.push('coordinates');
        const comments: string[] = [];
        if (missing.length > 0) comments.push(`Not recorded in Flame: ${missing.join(', ')}.`);
        if (entry.sum.editionsWithoutTier.size > 0) {
          comments.push(
            `IPCC tier not set in methodology edition ${sorted(entry.sum.editionsWithoutTier).join(', ')}.`,
          );
        }
        if (entry.sum.editions.size > 1) {
          comments.push(`Methodology editions ${sorted(entry.sum.editions).join(', ')} used.`);
        }
        if (entry.month.spans) {
          comments.push('Approved record(s) spanning these months, not split between months.');
        }
        if (entry.sum.estimated) comments.push('Includes estimated data.');
        return {
          serial: index + 1,
          year: String(year),
          month: entry.month.name,
          companyName: organisation.name,
          companyAbbreviation: organisation.abbreviation,
          terrain: f.terrain ? (TERRAIN_LABELS[f.terrain] ?? f.terrain) : null,
          concession: f.concession,
          fieldName: f.fieldName,
          facilityId: f.id,
          facilityName: f.name,
          facilityType: f.facilityType ? NUPRC_FACILITY_TYPE_LABELS[f.facilityType] : null,
          coordinates:
            f.latitude !== null && f.longitude !== null
              ? `${exact(f.latitude)}, ${exact(f.longitude)}`
              : null,
          framework: entry.sum.frameworks.size > 0 ? sorted(entry.sum.frameworks).join('; ') : null,
          emissionSource: entry.source,
          equipmentType: entry.equipment,
          unit: 'Tonnes CO2e' as const,
          co2: entry.sum.co2.toFixed(),
          ch4: entry.sum.ch4.toFixed(),
          n2o: entry.sum.n2o === null ? null : entry.sum.n2o.toFixed(),
          total: entry.sum.total.toFixed(),
          comments: comments.join(' '),
        };
      });

    // Quarter totals by gas, per facility and source (template section 7).
    const gas = new Map<string, { row: Row; source: NuprcEmissionSource; sum: GasSum }>();
    for (const r of placed) {
      const source = emissionSourceOf(r.activityType);
      const edition = editionOf(r);
      if (!source || !edition) continue;
      const key = `${r.flareSource.asset.facility.id}|${source}`;
      let entry = gas.get(key);
      if (!entry) {
        entry = { row: r, source, sum: new GasSum() };
        gas.set(key, entry);
      }
      entry.sum.add(r, edition);
    }
    const gasTotals: NuprcGasTotalsDto[] = [...gas.values()]
      .sort(
        (a, b) =>
          a.row.flareSource.asset.facility.name.localeCompare(
            b.row.flareSource.asset.facility.name,
          ) || a.source.localeCompare(b.source),
      )
      .map(({ row, source, sum }) => ({
        facilityId: row.flareSource.asset.facility.id,
        facilityName: row.flareSource.asset.facility.name,
        emissionSource: source,
        co2: sum.co2.toFixed(),
        ch4: sum.ch4.toFixed(),
        n2o: sum.n2o === null ? null : sum.n2o.toFixed(),
        total: sum.total.toFixed(),
        calculationCount: sum.count,
      }));

    // Activity data per facility and activity type (template section 4).
    const activity = new Map<string, { row: Row; approved: Dec; calculated: Dec; count: number }>();
    for (const r of placed) {
      const volume = r.standardVolumeMmscf ?? r.derivedVolumeMmscf;
      const key = `${r.flareSource.asset.facility.id}|${r.activityType}`;
      let entry = activity.get(key);
      if (!entry) {
        entry = { row: r, approved: new D(0), calculated: new D(0), count: 0 };
        activity.set(key, entry);
      }
      entry.count += 1;
      if (volume !== null) {
        entry.approved = entry.approved.plus(exact(volume));
        if (r.calculations.length > 0) entry.calculated = entry.calculated.plus(exact(volume));
      }
    }
    const activityTotals: NuprcActivityTotalsDto[] = [...activity.values()]
      .sort(
        (a, b) =>
          a.row.flareSource.asset.facility.name.localeCompare(
            b.row.flareSource.asset.facility.name,
          ) || a.row.activityType.localeCompare(b.row.activityType),
      )
      .map(({ row, approved, calculated, count }) => ({
        facilityId: row.flareSource.asset.facility.id,
        facilityName: row.flareSource.asset.facility.name,
        activityType: row.activityType,
        approvedVolumeMmscf: approved.toFixed(),
        volumeCalculatedMmscf: calculated.toFixed(),
        recordCount: count,
      }));

    // Appendix A: flaring and venting sources with approved data in the quarter.
    const a = new Map<
      string,
      {
        row: Row;
        source: NuprcEmissionSource;
        equipment: string;
        sources: Set<string>;
        methods: Set<string>;
      }
    >();
    for (const r of placed) {
      const source = emissionSourceOf(r.activityType);
      if (!source) continue;
      const equipment = equipmentTypeOf(source, r.flareSource.flareType);
      const key = `${r.flareSource.asset.facility.id}|${source}|${equipment}`;
      let entry = a.get(key);
      if (!entry) {
        entry = { row: r, source, equipment, sources: new Set(), methods: new Set() };
        a.set(key, entry);
      }
      entry.sources.add(r.flareSource.id);
      const calc = r.calculations[0];
      const route = calc ? editions.get(calc.editionId)?.routes.get(calc.route) : undefined;
      entry.methods.add(route ? route.title : 'No approved calculation');
    }
    const appendixA: NuprcAppendixARowDto[] = [...a.values()]
      .sort(
        (x, y) =>
          x.row.flareSource.asset.facility.name.localeCompare(
            y.row.flareSource.asset.facility.name,
          ) ||
          x.source.localeCompare(y.source) ||
          x.equipment.localeCompare(y.equipment),
      )
      .map((entry, index) => {
        const f = entry.row.flareSource.asset.facility;
        return {
          serial: index + 1,
          facilityName: f.name,
          facilityType: f.facilityType ? NUPRC_FACILITY_TYPE_LABELS[f.facilityType] : null,
          location: f.terrain ? (TERRAIN_LABELS[f.terrain] ?? f.terrain) : null,
          sourceCategory: entry.source,
          equipmentType: entry.equipment,
          quantity: entry.sources.size,
          segment: f.segment ? FACILITY_SEGMENT_LABELS[f.segment] : null,
          pollutants: entry.source === 'Flaring' ? 'CO2, CH4, N2O' : 'CH4, CO2',
          quantificationMethod: sorted(entry.methods).join('; '),
          uncertainty: 'Not quantified in Flame',
        };
      });

    const counts = new Map<string, number>();
    for (const r of placed) {
      const calc = r.calculations[0];
      if (calc && emissionSourceOf(r.activityType)) {
        counts.set(calc.editionId, (counts.get(calc.editionId) ?? 0) + 1);
      }
    }
    const editionDtos: ReportEditionDto[] = [...editions.values()].map((e) => ({
      ...e.dto,
      calculationCount: counts.get(e.dto.id) ?? 0,
    }));

    const notes = [
      'Approved activity records and approved calculations only; records still in review are counted under coverage, not in the figures.',
      'CO2, CH4 and N2O are each calculation’s gas tonnes × its methodology edition’s GWP; TOTAL is the approved calculations’ tCO2e. They can differ in the last decimal place because each calculation rounds its results.',
    ];
    if (crossMonth > 0) {
      notes.push(
        `${String(crossMonth)} approved record(s) cross a month boundary inside the quarter: each is in an Appendix C row whose MONTH names the months it spans, and is not split between months.`,
      );
    }
    const otherReleases = placed.filter((r) => r.activityType === 'OTHER_RELEASE').length;
    if (otherReleases > 0) {
      notes.push(
        `${String(otherReleases)} approved other gas release record(s) are not calculated in Flame and are not included.`,
      );
    }
    const signatures = new Set(editionDtos.map((e) => JSON.stringify(e.gwp)));

    return {
      kind: 'QUARTERLY_GHG_INVENTORY',
      source: QUARTERLY_SOURCE,
      organisation,
      period,
      generatedAt: this.now().toISOString(),
      appendixC,
      appendixA,
      gasTotals,
      activityTotals,
      editions: editionDtos,
      gwpConsistent: signatures.size <= 1,
      coverage,
      unplaced,
      notRecorded: QUARTERLY_NOT_RECORDED,
      notes,
    };
  }

  // ─── Monthly flare and vent log ────────────────────────────────────────────

  async monthly(organisationId: string, period: ReportPeriodDto): Promise<NuprcMonthlyLogDto> {
    if (period.granularity !== 'MONTH') throw new Error('A month is required');
    const organisation = await this.organisation(organisationId);
    const rows = await this.rows(organisationId, period.start, period.end);
    const { placed, unplaced, coverage } = this.placedIn(rows, period);
    // Approved events crossing the month boundary are listed (in every month they touch),
    // flagged, and kept out of the monthly totals (decision 2026-11-20).
    const placedIds = new Set(placed.map((r) => r.id));
    const spanning = rows.filter((r) => r.status === 'APPROVED' && !placedIds.has(r.id));
    const listed = [...placed, ...spanning].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime() || a.id.localeCompare(b.id),
    );
    const ventingEditions = await this.editions([
      ...new Set(
        listed
          .filter((r) => r.activityType === 'VENTING')
          .flatMap((r) => r.calculations.map((c) => c.editionId)),
      ),
    ]);

    const entries: NuprcMonthlyLogEntryDto[] = [];
    const totals = new Map<string, { row: Row; flared: Dec; vented: Dec }>();
    let flared = new D(0);
    let vented = new D(0);
    for (const r of listed) {
      const source = emissionSourceOf(r.activityType);
      if (!source) continue;
      const spansMonths = !placedIds.has(r.id);
      const volume = r.standardVolumeMmscf ?? r.derivedVolumeMmscf;
      const calc = r.calculations[0];
      const ch4Gwp = calc ? ventingEditions.get(calc.editionId)?.gwp.ch4 : undefined;
      entries.push({
        recordId: r.id,
        facilityName: r.flareSource.asset.facility.name,
        flareSourceName: r.flareSource.name,
        flareSourceCode: r.flareSource.code,
        emissionSource: source,
        activityType: r.activityType,
        periodStart: isoDateOf(r.periodStart),
        periodEnd: isoDateOf(r.periodEnd),
        startTime: r.startTime,
        durationHours: r.operatingHours === null ? null : exact(r.operatingHours),
        rateMmscfd: r.standardRateMmscfd === null ? null : exact(r.standardRateMmscfd),
        volumeMmscf: volume === null ? null : exact(volume),
        originalVolume:
          r.totalVolumeInput !== null && r.volumeUnit !== null
            ? { value: r.totalVolumeInput, unit: r.volumeUnit }
            : null,
        gasSource: r.gasSource,
        measurementBasis: r.measurementBasis,
        spansMonths,
        ch4Co2e:
          source === 'Venting' && calc && ch4Gwp
            ? new D(exact(calc.ch4Tonnes)).times(ch4Gwp).toFixed()
            : null,
      });
      if (spansMonths) continue;
      let total = totals.get(r.flareSource.id);
      if (!total) {
        total = { row: r, flared: new D(0), vented: new D(0) };
        totals.set(r.flareSource.id, total);
      }
      if (volume !== null) {
        if (source === 'Flaring') {
          total.flared = total.flared.plus(exact(volume));
          flared = flared.plus(exact(volume));
        } else {
          total.vented = total.vented.plus(exact(volume));
          vented = vented.plus(exact(volume));
        }
      }
    }

    const sourceTotals: NuprcMonthlySourceTotalDto[] = [...totals.values()]
      .sort(
        (a, b) =>
          a.row.flareSource.asset.facility.name.localeCompare(
            b.row.flareSource.asset.facility.name,
          ) || a.row.flareSource.code.localeCompare(b.row.flareSource.code),
      )
      .map(({ row, flared: f, vented: v }) => ({
        flareSourceId: row.flareSource.id,
        flareSourceName: row.flareSource.name,
        flareSourceCode: row.flareSource.code,
        facilityName: row.flareSource.asset.facility.name,
        flaredMmscf: f.toFixed(),
        ventedMmscf: v.toFixed(),
      }));

    const notes = [
      'Approved activity records only; records still in review are counted under coverage, not in the log.',
      'Volumes are standardised (MMscf at 15 °C and 101.325 kPa); the volume as entered is shown alongside.',
    ];
    const spanningEntries = entries.filter((e) => e.spansMonths).length;
    if (spanningEntries > 0) {
      notes.push(
        `${String(spanningEntries)} entr(ies) cross a month boundary: listed in each month they touch and not counted in either month's totals (volumes are never split).`,
      );
    }
    const noTime = entries.filter((e) => e.startTime === null).length;
    const noSource = entries.filter((e) => e.gasSource === null).length;
    if (noTime > 0) notes.push(`${String(noTime)} entr(ies) have no start time recorded.`);
    if (noSource > 0)
      notes.push(`${String(noSource)} entr(ies) have no gas source or type recorded.`);
    const otherReleases = placed.filter((r) => r.activityType === 'OTHER_RELEASE').length;
    if (otherReleases > 0) {
      notes.push(
        `${String(otherReleases)} approved other gas release record(s) are outside regulation 20 and not listed.`,
      );
    }

    return {
      kind: 'MONTHLY_FLARE_VENT_LOG',
      source: MONTHLY_SOURCE,
      organisation,
      period,
      generatedAt: this.now().toISOString(),
      entries,
      sourceTotals,
      totals: { flaredMmscf: flared.toFixed(), ventedMmscf: vented.toFixed() },
      coverage,
      unplaced,
      notRecorded: MONTHLY_NOT_RECORDED,
      notes,
    };
  }
}
