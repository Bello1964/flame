import {
  ACTIVITY_TYPES,
  CANONICAL_REFERENCE,
  REPORT_BASIS_LABEL,
  type ActivityType,
  type EmissionsReportDto,
  type EmissionsTrendDto,
  type ReportEditionDto,
  type ReportFilters,
  type ReportPeriodDto,
  type TrendMonthDto,
} from '@flame/shared';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { exact } from '../../lib/decimal.js';
import { notFound } from '../../lib/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { isoDateOf } from '../activity/activity.repository.js';
import type { Caller } from '../activity/activity.service.js';
import { aggregate, isPlaced, type ReportRecordRow } from './aggregate.js';
import { todayIn, trailingMonths } from './period.js';

/** Calculations that are neither approved nor closed. */
const IN_PROGRESS = ['CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL'] as const;

/** Exact sums for the trend (same precision rule as aggregate.ts). */
const D = Prisma.Decimal.clone({ precision: 80, rounding: Prisma.Decimal.ROUND_HALF_EVEN });

/**
 * Live emissions reports (ARCHITECTURAL_WORKFLOW.md §8.2). Read-only: figures are
 * recomputed from approved calculations on every request, and nothing is stored.
 * A figure counts only when its calculation is APPROVED and its activity record is still
 * APPROVED (a superseded record drops out with its calculation).
 */
export class ReportingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Records of the organisation whose dates overlap [start, end], for aggregation. */
  private async records(
    organisationId: string,
    start: string,
    end: string,
    filters: ReportFilters,
  ): Promise<ReportRecordRow[]> {
    const rows = await this.prisma.activityRecord.findMany({
      where: {
        organisationId,
        status: { notIn: ['WITHDRAWN', 'REJECTED', 'SUPERSEDED'] },
        periodStart: { lte: new Date(`${end}T00:00:00Z`) },
        periodEnd: { gte: new Date(`${start}T00:00:00Z`) },
        ...(filters.activityType ? { activityType: filters.activityType } : {}),
        ...(filters.facilityId
          ? { flareSource: { asset: { facilityId: filters.facilityId } } }
          : {}),
      },
      select: {
        id: true,
        activityType: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        revisionOfId: true,
        standardVolumeMmscf: true,
        derivedVolumeMmscf: true,
        flareSource: {
          select: {
            id: true,
            name: true,
            code: true,
            asset: {
              select: {
                id: true,
                name: true,
                code: true,
                facility: { select: { id: true, name: true, code: true, timeZone: true } },
              },
            },
          },
        },
        calculations: {
          where: { status: { in: ['APPROVED', ...IN_PROGRESS] } },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            route: true,
            editionId: true,
            edition: { select: { edition: true } },
            dataQuality: true,
            co2Tonnes: true,
            ch4Tonnes: true,
            n2oTonnes: true,
            co2eTonnes: true,
            approvedAt: true,
          },
        },
      },
    });

    return rows.map((r) => {
      // Approving a calculation supersedes the previous approved one, so there is at most
      // one; the highest version is taken should that ever not hold.
      const approved = r.calculations.find((c) => c.status === 'APPROVED');
      const volume = r.standardVolumeMmscf ?? r.derivedVolumeMmscf;
      const { asset } = r.flareSource;
      return {
        id: r.id,
        activityType: r.activityType,
        periodStart: isoDateOf(r.periodStart),
        periodEnd: isoDateOf(r.periodEnd),
        status: r.status,
        revisionOfId: r.revisionOfId,
        volumeMmscf: volume === null ? null : exact(volume),
        facility: asset.facility,
        asset: { id: asset.id, name: asset.name, code: asset.code },
        flareSource: { id: r.flareSource.id, name: r.flareSource.name, code: r.flareSource.code },
        approvedCalculation:
          approved && approved.approvedAt
            ? {
                id: approved.id,
                version: approved.version,
                route: approved.route,
                editionId: approved.editionId,
                edition: approved.edition.edition,
                dataQuality: approved.dataQuality,
                co2Tonnes: exact(approved.co2Tonnes),
                ch4Tonnes: exact(approved.ch4Tonnes),
                n2oTonnes: approved.n2oTonnes === null ? null : exact(approved.n2oTonnes),
                co2eTonnes: exact(approved.co2eTonnes),
                approvedAt: approved.approvedAt.toISOString(),
              }
            : null,
        calculationsInProgress: r.calculations.filter((c) => c.status !== 'APPROVED').length,
      };
    });
  }

  /** A facility filter must name a facility of this organisation (else 404, as elsewhere). */
  private async checkFilters(
    organisationId: string,
    filters: ReportFilters,
  ): Promise<{ id: string; name: string; code: string } | null> {
    if (!filters.facilityId) return null;
    const facility = await this.prisma.facility.findFirst({
      where: { id: filters.facilityId, organisationId },
      select: { id: true, name: true, code: true },
    });
    if (!facility) throw notFound('Facility not found');
    return facility;
  }

  private today = (timeZone: string) => todayIn(timeZone, this.now());

  async emissions(
    organisationId: string,
    period: ReportPeriodDto,
    filters: ReportFilters,
  ): Promise<EmissionsReportDto> {
    const facility = await this.checkFilters(organisationId, filters);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { id: true, name: true },
    });
    const records = await this.records(organisationId, period.start, period.end, filters);
    const result = aggregate(records, period, this.today);

    const counts = new Map<string, number>();
    for (const c of result.calculations)
      counts.set(c.editionId, (counts.get(c.editionId) ?? 0) + 1);
    const editions: ReportEditionDto[] =
      counts.size === 0
        ? []
        : (
            await this.prisma.methodologyEdition.findMany({
              where: { id: { in: [...counts.keys()] } },
              orderBy: [{ code: 'asc' }, { edition: 'asc' }],
              select: {
                id: true,
                code: true,
                edition: true,
                title: true,
                parameters: {
                  where: { key: { in: ['gwp.co2', 'gwp.ch4', 'gwp.n2o'] } },
                  select: { key: true, value: true },
                },
              },
            })
          ).map((e) => {
            const gwp = (key: string) => {
              const p = e.parameters.find((x) => x.key === key);
              return p ? exact(p.value) : null;
            };
            return {
              id: e.id,
              code: e.code,
              edition: e.edition,
              title: e.title,
              gwp: { co2: gwp('gwp.co2'), ch4: gwp('gwp.ch4'), n2o: gwp('gwp.n2o') },
              calculationCount: counts.get(e.id) ?? 0,
            };
          });
    const signatures = new Set(editions.map((e) => JSON.stringify(e.gwp)));

    return {
      basis: REPORT_BASIS_LABEL,
      organisation,
      period,
      filters,
      facility,
      generatedAt: this.now().toISOString(),
      referenceCondition: CANONICAL_REFERENCE.label,
      ...result,
      editions,
      gwpConsistent: signatures.size <= 1,
    };
  }

  /** tCO₂e per month for the twelve months ending with `endMonth` ("YYYY-MM"). */
  async trend(
    organisationId: string,
    endMonth: string,
    filters: ReportFilters,
  ): Promise<EmissionsTrendDto> {
    await this.checkFilters(organisationId, filters);
    const months = trailingMonths(endMonth);
    const first = months[0];
    const last = months[months.length - 1];
    if (!first || !last) throw notFound();
    const records = (await this.records(organisationId, first.start, last.end, filters)).filter(
      (r) => r.status === 'APPROVED' && r.approvedCalculation !== null && r.volumeMmscf !== null,
    );

    const result: TrendMonthDto[] = months.map((month) => {
      const sums = new Map<ActivityType, InstanceType<typeof D>>();
      let total: InstanceType<typeof D> | null = null;
      let includesEstimated = false;
      for (const r of records) {
        const calc = r.approvedCalculation;
        if (!calc || !isPlaced(r, month)) continue;
        sums.set(r.activityType, (sums.get(r.activityType) ?? new D(0)).plus(calc.co2eTonnes));
        total = (total ?? new D(0)).plus(calc.co2eTonnes);
        if (calc.dataQuality === 'ESTIMATED') includesEstimated = true;
      }
      const byType = Object.fromEntries(
        ACTIVITY_TYPES.map((t) => [t, sums.get(t)?.toFixed() ?? null]),
      ) as Record<ActivityType, string | null>;
      return {
        key: month.key,
        label: month.label,
        byType,
        total: total === null ? null : total.toFixed(),
        includesEstimated,
      };
    });

    return { basis: REPORT_BASIS_LABEL, filters, months: result };
  }

  /** Audits a CSV export (viewing a report on screen is not audited). */
  async recordExport(caller: Caller, report: EmissionsReportDto): Promise<void> {
    await recordAudit(this.prisma, {
      organisationId: caller.organisationId,
      actorUserId: caller.userId,
      action: 'report.exported',
      entityType: 'emissions_report',
      metadata: {
        format: 'csv',
        period: report.period.key,
        facilityId: report.filters.facilityId,
        activityType: report.filters.activityType,
        calculationCount: report.calculations.length,
      },
      ipAddress: caller.ipAddress,
    });
  }
}
