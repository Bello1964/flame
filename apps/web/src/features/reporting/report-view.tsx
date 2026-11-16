import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Info } from 'lucide-react';
import type {
  ActivityTypeRowDto,
  CrossTypeTotalDto,
  EmissionsReportDto,
  FlareSourceReportDto,
  ReportCoverageDto,
  ReportSectionDto,
} from '@flame/shared';
import { formatCount, formatDate, formatDateTime, formatDecimal } from '@/lib/format';
import { ACTIVITY_TYPE_LABELS } from '@/features/activity/labels';
import { DataQualityBadge } from '@/features/calculations/badges';
import { ROUTE_LABELS } from '@/features/calculations/labels';

/**
 * Presentation of an emissions report (ARCHITECTURAL_WORKFLOW.md §8.2). Every figure comes
 * from the API; this file only formats. Display rounding: 3 decimal places for tonnes and
 * MMscf, never showing a non-zero value as 0 (formatDecimal); the CSV has full precision.
 */

const T = 3;

function Num({ value, unit }: { value: string | null; unit?: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {formatDecimal(value, T)}
      {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
    </span>
  );
}

/** N₂O for venting is "not applicable", never 0. */
function N2o({ e }: { e: CrossTypeTotalDto | null }) {
  if (!e) return <span className="text-muted-foreground">—</span>;
  if (e.n2oTonnes === null) return <span className="text-xs text-muted-foreground">n/a</span>;
  return <Num value={e.n2oTonnes} />;
}

function hasEstimated(e: CrossTypeTotalDto | null): boolean {
  return e !== null && Number(e.estimatedCo2eTonnes) > 0;
}

/** The headline figure with its period, scope, basis and quality split. */
export function ReportHeadline({ report }: { report: EmissionsReportDto }) {
  const total = report.summary.total;
  const scope = report.facility
    ? `${report.facility.name} (${report.facility.code})`
    : report.organisation.name;
  return (
    <section aria-labelledby="headline" className="rounded-lg border bg-card p-5 md:p-6">
      <p id="headline" className="text-sm text-muted-foreground">
        Total emissions · {report.period.label} · {scope}
        {report.filters.activityType && ` · ${ACTIVITY_TYPE_LABELS[report.filters.activityType]}`}
      </p>
      {total ? (
        <>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {formatDecimal(total.co2eTonnes, T)}
            <span className="ml-2 text-lg font-normal text-muted-foreground">tCO₂e</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sum of the activity types below, from {formatCount(total.calculationCount)} approved{' '}
            {total.calculationCount === 1 ? 'calculation' : 'calculations'}.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="CO₂">
              <Num value={total.co2Tonnes} unit="t" />
            </Figure>
            <Figure label="CH₄">
              <Num value={total.ch4Tonnes} unit="t" />
            </Figure>
            <Figure label="N₂O">
              {total.n2oTonnes === null ? (
                <span className="text-muted-foreground">not applicable</span>
              ) : (
                <Num value={total.n2oTonnes} unit="t" />
              )}
            </Figure>
            <Figure label="Measured basis">
              <Num value={total.measuredBasisCo2eTonnes} unit="tCO₂e" />
            </Figure>
            <Figure label="Estimated">
              <Num value={total.estimatedCo2eTonnes} unit="tCO₂e" />
            </Figure>
          </dl>
          {hasEstimated(total) && (
            <p className="mt-4 flex items-start gap-2 text-sm">
              <DataQualityBadge quality="ESTIMATED" />
              <span className="text-muted-foreground">
                Part of this total is estimated. Each calculation lists its reasons.
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-lg font-medium">No approved calculations in this period</p>
      )}
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        {report.basis} Generated {formatDateTime(report.generatedAt)}. Volumes are MMscf at{' '}
        {report.referenceCondition}.
      </p>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function sumCoverage(rows: ActivityTypeRowDto[]): ReportCoverageDto {
  const total: ReportCoverageDto = {
    approvedRecords: 0,
    approvedRecordsCalculated: 0,
    approvedRecordsAwaitingCalculation: 0,
    calculationsInProgress: 0,
    recordsNotYetApproved: 0,
    openRevisions: 0,
    approvedRecordsWithoutVolume: 0,
  };
  for (const r of rows) {
    for (const key of Object.keys(total) as (keyof ReportCoverageDto)[]) {
      total[key] += r.coverage[key];
    }
  }
  return total;
}

/** What the approved figures don't yet include. Counts only; never a pending tCO₂e. */
export function CoverageNotice({ report }: { report: EmissionsReportDto }) {
  const c = sumCoverage(report.summary.byType);
  const items = [
    c.approvedRecordsAwaitingCalculation > 0 &&
      `${formatCount(c.approvedRecordsAwaitingCalculation)} approved ${plural(c.approvedRecordsAwaitingCalculation, 'record has', 'records have')} no approved calculation yet` +
        (c.calculationsInProgress > 0
          ? ` (${formatCount(c.calculationsInProgress)} ${plural(c.calculationsInProgress, 'calculation', 'calculations')} in progress)`
          : ''),
    c.calculationsInProgress > 0 &&
      c.approvedRecordsAwaitingCalculation === 0 &&
      `${formatCount(c.calculationsInProgress)} ${plural(c.calculationsInProgress, 'recalculation is', 'recalculations are')} in progress; the approved versions count until they are replaced`,
    c.recordsNotYetApproved > 0 &&
      `${formatCount(c.recordsNotYetApproved)} ${plural(c.recordsNotYetApproved, 'record is', 'records are')} still in review or draft`,
    c.openRevisions > 0 &&
      `${formatCount(c.openRevisions)} ${plural(c.openRevisions, 'revision is', 'revisions are')} open; the approved originals count until they are approved`,
    c.approvedRecordsWithoutVolume > 0 &&
      `${formatCount(c.approvedRecordsWithoutVolume)} approved ${plural(c.approvedRecordsWithoutVolume, 'record has', 'records have')} a rate without operating hours, so no volume`,
    report.unplaced.length > 0 &&
      `${formatCount(report.unplaced.length)} approved ${plural(report.unplaced.length, 'record crosses', 'records cross')} the period boundary and ${plural(report.unplaced.length, 'is', 'are')} not counted (listed below)`,
    report.summary.byType.some((t) => t.activityType === 'OTHER_RELEASE') &&
      'Other gas releases are not calculated: no approved methodology covers them',
  ].filter((x): x is string => typeof x === 'string');

  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="coverage-heading"
      className="rounded-md border border-warning/50 bg-warning/10 p-4"
    >
      <h2 id="coverage-heading" className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        Not included in these figures
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function TypeRows({ section, totalLabel }: { section: ReportSectionDto; totalLabel: string }) {
  return (
    <>
      {section.byType.map((t) => (
        <tr key={t.activityType} className="border-b">
          <th scope="row" className="py-2 pr-3 text-left font-normal">
            {ACTIVITY_TYPE_LABELS[t.activityType]}
            {hasEstimated(t.emissions) && (
              <span className="ml-1 text-xs text-muted-foreground">(includes estimated)</span>
            )}
          </th>
          <td className="px-3 py-2 text-right font-medium">
            <Num value={t.emissions?.co2eTonnes ?? null} />
          </td>
          <td className="px-3 py-2 text-right">
            <Num value={t.emissions?.co2Tonnes ?? null} />
          </td>
          <td className="px-3 py-2 text-right">
            <Num value={t.emissions?.ch4Tonnes ?? null} />
          </td>
          <td className="px-3 py-2 text-right">
            <N2o e={t.emissions} />
          </td>
          <td className="px-3 py-2 text-right">
            <Num value={t.emissions?.volumeCalculatedMmscf ?? null} />
          </td>
          <td className="px-3 py-2 text-right">
            <Num value={t.approvedVolumeMmscf} />
          </td>
          <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
            {formatCount(t.coverage.approvedRecordsCalculated)} of{' '}
            {formatCount(t.coverage.approvedRecords)}
          </td>
        </tr>
      ))}
      <tr className="bg-muted/50 font-medium">
        <th scope="row" className="py-2 pr-3 text-left">
          {totalLabel}
        </th>
        <td className="px-3 py-2 text-right">
          <Num value={section.total?.co2eTonnes ?? null} />
        </td>
        <td className="px-3 py-2 text-right">
          <Num value={section.total?.co2Tonnes ?? null} />
        </td>
        <td className="px-3 py-2 text-right">
          <Num value={section.total?.ch4Tonnes ?? null} />
        </td>
        <td className="px-3 py-2 text-right">
          <N2o e={section.total} />
        </td>
        <td colSpan={3} className="py-2 pl-3 text-xs font-normal text-muted-foreground">
          Volumes are never added across activity types.
        </td>
      </tr>
    </>
  );
}

function TypeTableHead({ first }: { first: string }) {
  return (
    <thead>
      <tr className="border-b text-xs text-muted-foreground">
        <th scope="col" className="py-2 pr-3 text-left font-medium">
          {first}
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          tCO₂e
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          CO₂ (t)
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          CH₄ (t)
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          N₂O (t)
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          Volume calculated (MMscf)
        </th>
        <th scope="col" className="px-3 py-2 text-right font-medium">
          Approved volume (MMscf)
        </th>
        <th scope="col" className="py-2 pl-3 text-right font-medium">
          Records calculated
        </th>
      </tr>
    </thead>
  );
}

/** Per-type summary: tCO₂e per type plus a labelled total; volumes per type only. */
export function TypeSummary({ report }: { report: EmissionsReportDto }) {
  if (report.summary.byType.length === 0) return null;
  return (
    <section aria-labelledby="by-type" className="space-y-2">
      <h2 id="by-type" className="text-lg font-semibold">
        By activity type
      </h2>
      <p className="text-sm text-muted-foreground">
        “Volume calculated” is the volume behind the approved tCO₂e; “Approved volume” is every
        approved record, calculated or not. The difference is what isn’t calculated yet.
      </p>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[52rem] text-sm print:min-w-0">
          <TypeTableHead first="Activity type" />
          <tbody>
            <TypeRows
              section={report.summary}
              totalLabel="Total, all activity types (tCO₂e only)"
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DayCoverage({ source }: { source: FlareSourceReportDto }) {
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {source.dayCoverage.map((d) => (
        <li key={d.activityType}>
          {ACTIVITY_TYPE_LABELS[d.activityType]}: approved records cover{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatCount(d.daysCovered)} of {formatCount(d.daysElapsed)}
          </span>{' '}
          days{d.daysElapsed < 1 ? ' (the period hasn’t started)' : ''}
        </li>
      ))}
    </ul>
  );
}

/** Facility → asset → flare source, each with its own per-type table and day coverage. */
export function Breakdown({ report, orgPath }: { report: EmissionsReportDto; orgPath: string }) {
  if (report.facilities.length === 0) return null;
  return (
    <section aria-labelledby="breakdown" className="space-y-4">
      <h2 id="breakdown" className="text-lg font-semibold">
        By facility, asset and flare source
      </h2>
      <p className="text-sm text-muted-foreground">
        Day coverage counts the days that approved records cover, up to today. A day without a
        record is not treated as zero.
      </p>
      {report.facilities.map((f) => (
        <details key={f.id} open className="group rounded-md border bg-card">
          <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <span className="font-medium">
              <Link to={`${orgPath}/facilities/${f.id}`} className="hover:underline">
                {f.name}
              </Link>{' '}
              <span className="text-sm font-normal text-muted-foreground">{f.code}</span>
            </span>
            <span className="text-sm">
              <Num value={f.total?.co2eTonnes ?? null} unit="tCO₂e" />
            </span>
          </summary>
          <div className="space-y-5 border-t px-4 py-4">
            {f.assets.map((a) => (
              <div key={a.id} className="space-y-3">
                <h3 className="text-sm font-medium">
                  <Link to={`${orgPath}/assets/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>{' '}
                  <span className="font-normal text-muted-foreground">{a.code}</span>
                  <span className="ml-2 font-normal text-muted-foreground">
                    · <Num value={a.total?.co2eTonnes ?? null} unit="tCO₂e" />
                  </span>
                </h3>
                {a.flareSources.map((s) => (
                  <div key={s.id} className="space-y-2 border-l-2 border-border pl-3">
                    <p className="text-sm">
                      <Link
                        to={`${orgPath}/flare-sources/${s.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </Link>{' '}
                      <span className="text-muted-foreground">{s.code}</span>
                    </p>
                    <DayCoverage source={s} />
                    <div className="overflow-x-auto print:overflow-visible">
                      <table className="w-full min-w-[52rem] text-sm print:min-w-0">
                        <TypeTableHead first="Activity type" />
                        <tbody>
                          <TypeRows section={s} totalLabel="Flare source total (tCO₂e only)" />
                        </tbody>
                      </table>
                    </div>
                    <CalculationLinks report={report} sourceId={s.id} orgPath={orgPath} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function CalculationLinks({
  report,
  sourceId,
  orgPath,
}: {
  report: EmissionsReportDto;
  sourceId: string;
  orgPath: string;
}) {
  const calcs = report.calculations.filter((c) => c.flareSourceId === sourceId);
  if (calcs.length === 0) return null;
  return (
    <details className="text-sm print:hidden">
      <summary className="cursor-pointer text-muted-foreground">
        {formatCount(calcs.length)} approved {plural(calcs.length, 'calculation', 'calculations')}
      </summary>
      <ul className="mt-2 space-y-1">
        {calcs.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to={`${orgPath}/calculations/${c.id}`} className="hover:underline">
              {formatDate(c.periodStart)}
              {c.periodEnd !== c.periodStart && ` – ${formatDate(c.periodEnd)}`} ·{' '}
              {ACTIVITY_TYPE_LABELS[c.activityType]} · version {c.version}
            </Link>
            <Num value={c.co2eTonnes} unit="tCO₂e" />
            <DataQualityBadge quality={c.dataQuality} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The methodology editions behind the figures, with a warning if their GWPs differ. */
export function EditionsUsed({ report, orgPath }: { report: EmissionsReportDto; orgPath: string }) {
  if (report.editions.length === 0) return null;
  return (
    <section aria-labelledby="editions" className="space-y-2">
      <h2 id="editions" className="text-lg font-semibold">
        Methodology
      </h2>
      {!report.gwpConsistent && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          The calculations in this period used methodology editions with different GWP values, so
          their tCO₂e are not on exactly the same basis.
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {report.editions.map((e) => (
          <li key={e.id}>
            <Link
              to={`${orgPath}/methodology/editions/${e.id}`}
              className="font-medium hover:underline"
            >
              {e.title} (edition {e.edition})
            </Link>{' '}
            <span className="text-muted-foreground">
              · GWP-100 CO₂ {e.gwp.co2 ?? '—'}, CH₄ {e.gwp.ch4 ?? '—'}, N₂O {e.gwp.n2o ?? '—'} ·{' '}
              {formatCount(e.calculationCount)}{' '}
              {plural(e.calculationCount, 'calculation', 'calculations')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Approved records crossing the period boundary: listed, never counted in this period. */
export function UnplacedRecords({
  report,
  orgPath,
}: {
  report: EmissionsReportDto;
  orgPath: string;
}) {
  if (report.unplaced.length === 0) return null;
  return (
    <section aria-labelledby="unplaced" className="space-y-2">
      <h2 id="unplaced" className="text-lg font-semibold">
        Not placed in this period
      </h2>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        These approved records start or end outside {report.period.label}, so they aren’t counted
        here. They count in any longer period that contains all their dates.
      </p>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[36rem] text-sm print:min-w-0">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Flare source
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Activity type
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Period
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Approved calculation
              </th>
            </tr>
          </thead>
          <tbody>
            {report.unplaced.map((u) => (
              <tr key={u.activityRecordId} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  {u.flareSourceName}{' '}
                  <span className="text-muted-foreground">{u.flareSourceCode}</span>
                </td>
                <td className="px-3 py-2">{ACTIVITY_TYPE_LABELS[u.activityType]}</td>
                <td className="px-3 py-2">
                  <Link
                    to={`${orgPath}/activity-records/${u.activityRecordId}`}
                    className="hover:underline"
                  >
                    {formatDate(u.periodStart)} – {formatDate(u.periodEnd)}
                  </Link>
                </td>
                <td className="py-2 pl-3 text-right">
                  {u.co2eTonnes === null ? (
                    <span className="text-muted-foreground">none</span>
                  ) : (
                    <Num value={u.co2eTonnes} unit="tCO₂e" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Every approved calculation counted, for the printed report. */
export function CalculationsTable({ report }: { report: EmissionsReportDto }) {
  if (report.calculations.length === 0) return null;
  return (
    <section aria-labelledby="calcs" className="space-y-2">
      <h2 id="calcs" className="text-lg font-semibold">
        Approved calculations included
      </h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-2 font-medium">
              Period
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              Flare source
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              Type
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              Route
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              Edition · version
            </th>
            <th scope="col" className="px-2 py-1 font-medium">
              Quality
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">
              tCO₂e
            </th>
          </tr>
        </thead>
        <tbody>
          {report.calculations.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="py-1 pr-2 whitespace-nowrap">
                {formatDate(c.periodStart)}
                {c.periodEnd !== c.periodStart && ` – ${formatDate(c.periodEnd)}`}
              </td>
              <td className="px-2 py-1">
                {c.facilityCode} / {c.flareSourceCode}
              </td>
              <td className="px-2 py-1">{ACTIVITY_TYPE_LABELS[c.activityType]}</td>
              <td className="px-2 py-1">{ROUTE_LABELS[c.route]}</td>
              <td className="px-2 py-1">
                {c.edition} · v{c.version}
              </td>
              <td className="px-2 py-1">
                {c.dataQuality === 'MEASURED_BASIS' ? 'Measured basis' : 'Estimated'}
              </td>
              <td className="py-1 pl-2 text-right">
                <Num value={c.co2eTonnes} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
