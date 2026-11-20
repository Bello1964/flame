import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Check, Loader2, Send, X } from 'lucide-react';
import { NUPRC_REPORT_KIND_LABELS, type IssuedReportDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/page-state';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useCurrentSession } from '@/features/auth/require-auth';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { nuprcCsvPath, useApproveIssued, useIssuedReport } from '@/features/reporting/nuprc-api';
import { MonthlyView, QuarterlyView } from '@/features/reporting/nuprc-views';
import { RejectDialog, SubmissionDialog } from '@/features/reporting/nuprc-dialogs';
import { StatusBadge } from '@/features/reporting/issued-status-badge';

/** /o/:organisationId/reports/issued/:id — a frozen NUPRC report and its approval. */
export function IssuedReportPage() {
  const { id = '' } = useParams();
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const report = useIssuedReport(orgId, id);

  if (report.isPending) return <LoadingState label="Loading the issued report…" />;
  if (report.isError) {
    return (
      <ErrorState
        title="Could not load the issued report"
        error={report.error}
        onRetry={() => void report.refetch()}
      />
    );
  }
  return (
    <IssuedReport orgId={orgId} report={report.data} canIssue={organisation.canIssueReports} />
  );
}

function IssuedReport({
  orgId,
  report,
  canIssue,
}: {
  orgId: string;
  report: IssuedReportDto;
  canIssue: boolean;
}) {
  const { user } = useCurrentSession();
  const approve = useApproveIssued(orgId);
  const [dialog, setDialog] = useState<'reject' | 'submission' | null>(null);
  const isIssuer = report.issuedBy.id === user.id;
  const awaiting = report.status === 'AWAITING_APPROVAL';
  const canRecord =
    canIssue &&
    (report.status === 'APPROVED' || report.status === 'SUPERSEDED') &&
    !report.submittedOn;

  const facts: [string, string][] = [
    ['Issued', `${report.issuedBy.name}, ${formatDateTime(report.issuedAt)}`],
    ...(report.reason ? ([['Reason', report.reason]] as [string, string][]) : []),
    ...(report.approvedBy && report.approvedAt
      ? ([['Approved', `${report.approvedBy.name}, ${formatDateTime(report.approvedAt)}`]] as [
          string,
          string,
        ][])
      : []),
    ...(report.rejectedBy && report.rejectedAt
      ? ([
          ['Rejected', `${report.rejectedBy.name}, ${formatDateTime(report.rejectedAt)}`],
          ['Comment', report.rejectionComment ?? ''],
        ] as [string, string][])
      : []),
    ...(report.supersededAt
      ? ([['Superseded', formatDateTime(report.supersededAt)]] as [string, string][])
      : []),
    ...(report.submittedOn
      ? ([
          [
            'Submitted to NUPRC',
            `${report.submittedOn}${report.submissionReference ? ` (reference ${report.submissionReference})` : ''}`,
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm">
          <Link
            to={`/o/${orgId}/reports/nuprc`}
            className="text-primary underline-offset-4 hover:underline"
          >
            NUPRC reports
          </Link>{' '}
          / Issued
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {NUPRC_REPORT_KIND_LABELS[report.kind]} — {report.periodLabel}, version {report.version}
          </h1>
          <StatusBadge report={report} />
        </div>
        <p className="text-sm text-muted-foreground">
          Frozen when issued: these figures never change, whatever happens to the data later.
        </p>
      </header>

      <dl className="grid max-w-3xl gap-2 rounded-md border bg-card p-4 text-sm sm:grid-cols-[10rem_1fr]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-medium">{k}</dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {canIssue && (awaiting || canRecord) && (
        <div className="flex flex-wrap items-center gap-2">
          {awaiting && isIssuer && (
            <p className="text-sm text-muted-foreground">
              You issued this report, so another Owner or Approver must approve or reject it.
            </p>
          )}
          {awaiting && !isIssuer && (
            <>
              <Button
                disabled={approve.isPending}
                onClick={() => {
                  approve.mutate(report.id, {
                    onSuccess: () => toast.success('Report approved.'),
                    onError: (error) => toast.error(`Could not approve. ${errorMessage(error)}`),
                  });
                }}
              >
                {approve.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Check aria-hidden />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDialog('reject');
                }}
              >
                <X aria-hidden />
                Reject
              </Button>
            </>
          )}
          {canRecord && (
            <Button
              variant="outline"
              onClick={() => {
                setDialog('submission');
              }}
            >
              <Send aria-hidden />
              Record submission to NUPRC
            </Button>
          )}
        </div>
      )}

      {report.status !== 'APPROVED' && (
        <p
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {report.status === 'SUPERSEDED'
            ? 'This version was superseded: submit the approved version instead.'
            : report.status === 'REJECTED'
              ? 'This version was rejected and must not be submitted.'
              : 'This version is not approved yet and must not be submitted.'}{' '}
          Its CSV file names say so.
        </p>
      )}

      {report.snapshot.kind === 'QUARTERLY_GHG_INVENTORY' ? (
        <QuarterlyView
          report={report.snapshot}
          downloads={(part) => nuprcCsvPath(orgId, { issuedId: report.id, part })}
        />
      ) : (
        <MonthlyView
          log={report.snapshot}
          downloads={(part) => nuprcCsvPath(orgId, { issuedId: report.id, part })}
        />
      )}

      {dialog === 'reject' && (
        <RejectDialog
          orgId={orgId}
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'submission' && (
        <SubmissionDialog
          orgId={orgId}
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
