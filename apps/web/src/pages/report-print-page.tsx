import { useEffect } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/page-state';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useEmissionsReport, useEmissionsTrend } from '@/features/reporting/api';
import { trendEndMonth } from '@/features/reporting/periods';
import { useReportParams } from '@/features/reporting/report-params';
import {
  Breakdown,
  CalculationsTable,
  CoverageNotice,
  EditionsUsed,
  ReportHeadline,
  TypeSummary,
  UnplacedRecords,
} from '@/features/reporting/report-view';
import { TrendChart } from '@/features/reporting/trend-chart';

/**
 * A print-friendly report: the browser's print dialog can save it as PDF. The app shell
 * and the controls are hidden when printing (print:hidden); the content is the same as
 * on screen, plus the list of calculations included.
 */
export function ReportPrintPage() {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const orgPath = `/o/${orgId}`;
  const { params, query } = useReportParams();
  const report = useEmissionsReport(orgId, params);
  const trend = useEmissionsTrend(orgId, trendEndMonth(params.period), {
    facilityId: params.facilityId,
    activityType: params.activityType,
  });

  useEffect(() => {
    if (report.data) {
      document.title = `Flame emissions report · ${report.data.period.label}`;
    }
  }, [report.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={`${orgPath}/reports?${query}`}>
            <ChevronLeft aria-hidden />
            Back to reports
          </Link>
        </Button>
        <Button
          size="sm"
          disabled={!report.data}
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden />
          Print or save as PDF
        </Button>
      </div>

      {report.isPending ? (
        <LoadingState label="Calculating the report…" />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <article className="space-y-8 print:space-y-6 print:text-[11px]">
          <header className="space-y-1">
            <p className="text-sm text-muted-foreground">Flame emissions report</p>
            <h1 className="text-2xl font-semibold">
              {report.data.organisation.name} · {report.data.period.label}
            </h1>
          </header>
          <ReportHeadline report={report.data} />
          <CoverageNotice report={report.data} />
          {trend.data && (
            <section className="break-inside-avoid space-y-2">
              <h2 className="text-lg font-semibold">Approved emissions per month (tCO₂e)</h2>
              <TrendChart trend={trend.data} />
            </section>
          )}
          <TypeSummary report={report.data} />
          <Breakdown report={report.data} orgPath={orgPath} />
          <UnplacedRecords report={report.data} orgPath={orgPath} />
          <EditionsUsed report={report.data} orgPath={orgPath} />
          <CalculationsTable report={report.data} />
        </article>
      )}
    </div>
  );
}
