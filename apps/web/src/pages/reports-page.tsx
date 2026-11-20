import { Link } from 'react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Loader2, Printer } from 'lucide-react';
import { errorMessage } from '@/lib/api-client';
import { ACTIVITY_TYPES, REPORT_GRANULARITIES, type ReportGranularity } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useHierarchyList } from '@/features/hierarchy/api';
import { ACTIVITY_TYPE_LABELS } from '@/features/activity/labels';
import { downloadCsv, useEmissionsReport, useEmissionsTrend } from '@/features/reporting/api';
import {
  convertPeriod,
  currentPeriod,
  granularityOf,
  isBeforeFloor,
  shiftPeriod,
  trendEndMonth,
} from '@/features/reporting/periods';
import { useReportParams } from '@/features/reporting/report-params';
import {
  Breakdown,
  CoverageNotice,
  EditionsUsed,
  ReportHeadline,
  TypeSummary,
  UnplacedRecords,
} from '@/features/reporting/report-view';
import { TrendChart } from '@/features/reporting/trend-chart';

const GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  MONTH: 'Month',
  QUARTER: 'Quarter',
  YEAR: 'Year',
};

/**
 * Live emissions reports (ARCHITECTURAL_WORKFLOW.md §8.2): approved calculations only,
 * recomputed by the API on every view. Issued, frozen reports come with the NUPRC
 * templates.
 */
export function ReportsPage() {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const orgPath = `/o/${orgId}`;
  const { params, update, query } = useReportParams();
  const granularity = granularityOf(params.period) ?? 'MONTH';
  const report = useEmissionsReport(orgId, params);
  const trend = useEmissionsTrend(orgId, trendEndMonth(params.period), {
    facilityId: params.facilityId,
    activityType: params.activityType,
  });
  const facilities = useHierarchyList(orgId, 'facilities', {
    page: 1,
    pageSize: 100,
    status: 'ALL',
  });
  const previous = shiftPeriod(params.period, -1);
  const next = shiftPeriod(params.period, 1);
  const data = report.data;
  const [downloading, setDownloading] = useState(false);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Emissions reports</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Monthly, quarterly and annual totals from approved calculations only, recalculated every
            time you open them. tCO₂e is an emissions figure, not carbon credits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={`${orgPath}/reports/nuprc`}>NUPRC reports</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`${orgPath}/reports/print?${query}`}>
              <Printer aria-hidden />
              Print view
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => {
              setDownloading(true);
              downloadCsv(orgId, params)
                .catch((error: unknown) => {
                  toast.error(`The CSV couldn’t be downloaded. ${errorMessage(error)}`);
                })
                .finally(() => {
                  setDownloading(false);
                });
            }}
          >
            {downloading ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            Download CSV
          </Button>
        </div>
      </header>

      <div
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
        role="group"
        aria-label="Report options"
      >
        <div
          className="inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="Period length"
        >
          {REPORT_GRANULARITIES.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={g === granularity ? 'default' : 'ghost'}
              aria-pressed={g === granularity}
              onClick={() => {
                update({ period: convertPeriod(params.period, g) });
              }}
            >
              {GRANULARITY_LABELS[g]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous period"
            disabled={isBeforeFloor(previous)}
            onClick={() => {
              update({ period: previous });
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
            {data?.period.key === params.period ? data.period.label : params.period}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next period"
            onClick={() => {
              update({ period: next });
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              update({ period: currentPeriod(granularity) });
            }}
          >
            Current
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-facility" className="text-xs text-muted-foreground">
            Facility
          </Label>
          <NativeSelect
            id="report-facility"
            className="w-56"
            value={params.facilityId ?? ''}
            onChange={(e) => {
              update({ facilityId: e.target.value || undefined });
            }}
          >
            <option value="">All facilities</option>
            {facilities.data?.data.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.code})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-type" className="text-xs text-muted-foreground">
            Activity type
          </Label>
          <NativeSelect
            id="report-type"
            className="w-48"
            value={params.activityType ?? ''}
            onChange={(e) => {
              const value = ACTIVITY_TYPES.find((t) => t === e.target.value);
              update({ activityType: value });
            }}
          >
            <option value="">All types</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {report.isError ? (
        <ErrorState
          title="The report couldn’t be loaded"
          error={report.error}
          onRetry={() => void report.refetch()}
        />
      ) : !data ? (
        <LoadingState label="Calculating the report…" />
      ) : (
        <div className={report.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <div className="space-y-8">
            <ReportHeadline report={data} />
            <CoverageNotice report={data} />

            <section aria-labelledby="trend" className="space-y-2">
              <h2 id="trend" className="text-lg font-semibold">
                Approved emissions per month (tCO₂e)
              </h2>
              <p className="text-sm text-muted-foreground">
                The twelve months to {trend.data?.months.at(-1)?.label ?? '…'}, by activity type.
                Records that cross a month boundary aren’t in any single month.
              </p>
              {trend.isPending ? (
                <LoadingState />
              ) : trend.isError ? (
                <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />
              ) : trend.data.months.every((m) => m.total === null) ? (
                <EmptyState
                  title="No approved emissions in these twelve months"
                  description="Figures appear once calculations of approved activity records are approved."
                />
              ) : (
                <TrendChart trend={trend.data} />
              )}
            </section>

            {data.facilities.length === 0 && data.unplaced.length === 0 ? (
              <EmptyState
                title={`Nothing recorded in ${data.period.label}`}
                description="No activity records fall wholly within this period for the chosen filters."
              />
            ) : (
              <>
                <TypeSummary report={data} />
                <Breakdown report={data} orgPath={orgPath} />
                <UnplacedRecords report={data} orgPath={orgPath} />
              </>
            )}
            <EditionsUsed report={data} orgPath={orgPath} />
          </div>
        </div>
      )}
    </div>
  );
}
