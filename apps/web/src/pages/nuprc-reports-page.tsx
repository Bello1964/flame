import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FileCheck2 } from 'lucide-react';
import { NUPRC_REPORT_KIND_LABELS, type NuprcReportKind } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import {
  nuprcCsvPath,
  useIssuedReports,
  useNuprcMonthly,
  useNuprcQuarterly,
} from '@/features/reporting/nuprc-api';
import { MonthlyView, QuarterlyView } from '@/features/reporting/nuprc-views';
import { IssueDialog } from '@/features/reporting/nuprc-dialogs';
import { StatusBadge } from '@/features/reporting/issued-status-badge';

type Tab = 'quarterly' | 'monthly';
const KIND: Record<Tab, NuprcReportKind> = {
  quarterly: 'QUARTERLY_GHG_INVENTORY',
  monthly: 'MONTHLY_FLARE_VENT_LOG',
};

/** The last complete calendar quarter and month (UTC), the usual ones to report. */
function defaults(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const lastMonth =
    m === 1 ? `${String(y - 1)}-12` : `${String(y)}-${String(m - 1).padStart(2, '0')}`;
  const q = Math.ceil(m / 3);
  const lastQuarter = q === 1 ? `${String(y - 1)}-Q4` : `${String(y)}-Q${String(q - 1)}`;
  return { quarterly: lastQuarter, monthly: lastMonth };
}

const QUARTER = /^\d{4}-Q[1-4]$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

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
];

/** "Q3 2026" or "July 2026". */
function periodLabel(key: string): string {
  if (QUARTER.test(key)) return `${key.slice(5)} ${key.slice(0, 4)}`;
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`;
}

/** Today's date in Nigeria (YYYY-MM-DD), matching the API's rule for issuing. */
function todayInLagos(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

/** Whether the period ("2026-Q3" or "2026-07") ended before `today`. */
function periodEnded(key: string, today: string): boolean {
  const year = Number(key.slice(0, 4));
  const lastMonth = QUARTER.test(key) ? Number(key.slice(6)) * 3 : Number(key.slice(5, 7));
  const end = new Date(Date.UTC(year, lastMonth, 0)).toISOString().slice(0, 10);
  return end < today;
}

/** /o/:organisationId/reports/nuprc — live NUPRC reports, issuing, and issued versions. */
export function NuprcReportsPage() {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('report') === 'monthly' ? 'monthly' : 'quarterly';
  const fallback = defaults();
  const requested = params.get('period') ?? '';
  const period =
    tab === 'quarterly'
      ? QUARTER.test(requested)
        ? requested
        : fallback.quarterly
      : MONTH.test(requested)
        ? requested
        : fallback.monthly;
  const [issuing, setIssuing] = useState(false);
  const issued = useIssuedReports(orgId);

  const select = (next: Tab, nextPeriod?: string) => {
    setParams({ report: next, period: nextPeriod ?? fallback[next] }, { replace: true });
  };

  const versions = (issued.data ?? []).filter(
    (r) => r.kind === KIND[tab] && r.periodKey === period,
  );
  const awaiting = versions.some((v) => v.status === 'AWAITING_APPROVAL');
  const ended = periodEnded(period, todayInLagos());
  const canIssueNow = organisation.canIssueReports && ended && !awaiting;
  const issueHint = !ended
    ? 'A report can be issued once its period has ended'
    : awaiting
      ? 'A version for this period is awaiting approval'
      : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm">
          <Link
            to={`/o/${orgId}/reports`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Emissions reports
          </Link>{' '}
          / NUPRC
        </p>
        <h1 className="text-2xl font-semibold">NUPRC reports</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The data parts of NUPRC&apos;s reports, from approved records and approved calculations
          only. Live figures change as data is approved; issue a report to freeze it for submission.
          Flame does not claim regulatory compliance.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Report" className="inline-flex rounded-md border p-1">
          {(['quarterly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              className={`rounded px-3 py-1.5 text-sm ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
              onClick={() => {
                select(t);
              }}
            >
              {t === 'quarterly' ? 'Quarterly GHG inventory' : 'Monthly flare and vent log'}
            </button>
          ))}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="nuprc-period">{tab === 'quarterly' ? 'Quarter' : 'Month'}</Label>
          {tab === 'quarterly' ? (
            <Input
              id="nuprc-period"
              className="w-36"
              defaultValue={period}
              key={`q-${period}`}
              placeholder="2026-Q3"
              onBlur={(e) => {
                const v = e.currentTarget.value.trim().toUpperCase();
                if (QUARTER.test(v)) select('quarterly', v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = e.currentTarget.value.trim().toUpperCase();
                  if (QUARTER.test(v)) select('quarterly', v);
                }
              }}
            />
          ) : (
            <Input
              id="nuprc-period"
              type="month"
              className="w-44"
              value={period}
              onChange={(e) => {
                if (MONTH.test(e.currentTarget.value)) select('monthly', e.currentTarget.value);
              }}
            />
          )}
        </div>
        {organisation.canIssueReports && (
          <Button
            disabled={!canIssueNow}
            aria-describedby={issueHint ? 'issue-hint' : undefined}
            onClick={() => {
              setIssuing(true);
            }}
          >
            <FileCheck2 aria-hidden />
            Issue this report
          </Button>
        )}
        {organisation.canIssueReports && issueHint && (
          <p id="issue-hint" className="text-sm text-muted-foreground">
            {issueHint}.
          </p>
        )}
      </div>

      {tab === 'quarterly' ? (
        <LiveQuarterly orgId={orgId} period={period} />
      ) : (
        <LiveMonthly orgId={orgId} period={period} />
      )}

      <section aria-labelledby="issued-heading" className="space-y-3">
        <h2 id="issued-heading" className="text-lg font-semibold">
          Issued reports
        </h2>
        {issued.isPending ? (
          <LoadingState label="Loading issued reports…" />
        ) : issued.isError ? (
          <ErrorState
            title="Could not load issued reports"
            error={issued.error}
            onRetry={() => void issued.refetch()}
          />
        ) : issued.data.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Nothing issued yet. Issue a report to freeze it for approval and submission.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issued.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{NUPRC_REPORT_KIND_LABELS[r.kind]}</TableCell>
                    <TableCell>{r.periodLabel}</TableCell>
                    <TableCell>v{r.version}</TableCell>
                    <TableCell>
                      <StatusBadge report={r} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.issuedBy.name}, {formatDateTime(r.issuedAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/o/${orgId}/reports/issued/${r.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {issuing && (
        <IssueDialog
          orgId={orgId}
          kind={KIND[tab]}
          period={period}
          periodLabel={periodLabel(period)}
          needsReason={versions.length > 0}
          onClose={() => {
            setIssuing(false);
          }}
          onIssued={(report) => {
            setIssuing(false);
            void navigate(`/o/${orgId}/reports/issued/${report.id}`);
          }}
        />
      )}
    </div>
  );
}

function LiveQuarterly({ orgId, period }: { orgId: string; period: string }) {
  const report = useNuprcQuarterly(orgId, period);
  if (report.isPending) return <LoadingState label="Building the quarterly inventory…" />;
  if (report.isError) {
    return (
      <ErrorState
        title="Could not build the report"
        error={report.error}
        onRetry={() => void report.refetch()}
      />
    );
  }
  return (
    <div aria-busy={report.isFetching} className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Live: {report.data.period.label}, generated {formatDateTime(report.data.generatedAt)}.
      </p>
      <QuarterlyView
        report={report.data}
        downloads={(part) => nuprcCsvPath(orgId, { kind: 'quarterly', period, part })}
      />
    </div>
  );
}

function LiveMonthly({ orgId, period }: { orgId: string; period: string }) {
  const log = useNuprcMonthly(orgId, period);
  if (log.isPending) return <LoadingState label="Building the monthly log…" />;
  if (log.isError) {
    return (
      <ErrorState
        title="Could not build the log"
        error={log.error}
        onRetry={() => void log.refetch()}
      />
    );
  }
  return (
    <div aria-busy={log.isFetching} className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Live: {log.data.period.label}, generated {formatDateTime(log.data.generatedAt)}.
      </p>
      <MonthlyView
        log={log.data}
        downloads={(part) => nuprcCsvPath(orgId, { kind: 'monthly', period, part })}
      />
    </div>
  );
}
