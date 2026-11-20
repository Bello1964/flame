import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { ActivityRecordDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import { cn } from '@/lib/utils';
import { formatCount, formatDateTime, formatDecimal } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useActivityList, type ActivityListParams } from '@/features/activity/api';
import { ActivityStatusBadge, ActivityTypeBadge, WarningCount } from '@/features/activity/badges';
import {
  BulkActionBar,
  SelectAllCheckbox,
  SelectRowCheckbox,
} from '@/features/activity/bulk-actions';
import { periodLabel } from '@/features/activity/labels';
import { CalculationQueues } from '@/features/calculations/calculation-queues';
import { useSelection } from '@/features/activity/use-selection';

const PAGE_SIZE = 25;

type QueueId = 'to-review' | 'mine' | 'approval';

interface Queue {
  id: QueueId;
  label: string;
  description: string;
  empty: string;
  params: Omit<ActivityListParams, 'page' | 'pageSize'>;
}

const QUEUES: Queue[] = [
  {
    id: 'to-review',
    label: 'To review',
    description:
      'Submitted records waiting for a reviewer, longest-waiting first. Start a review to take one; you can’t review records you entered, edited or submitted.',
    empty: 'No records are waiting for review.',
    params: { status: 'SUBMITTED', sort: 'submitted' },
  },
  {
    id: 'mine',
    label: 'My reviews',
    description:
      'Records you are reviewing. Forward each for approval or return it for correction.',
    empty: 'You aren’t reviewing any records.',
    params: { status: 'UNDER_REVIEW', claimedBy: 'me', sort: 'submitted' },
  },
  {
    id: 'approval',
    label: 'Awaiting approval',
    description:
      'Reviewed records waiting for a decision. You can’t approve records you were involved in or reviewed.',
    empty: 'No records are waiting for approval.',
    params: { status: 'AWAITING_APPROVAL', sort: 'submitted' },
  },
];

function StandardVolume({ r }: { r: ActivityRecordDto }) {
  const value = r.standardised.totalVolumeMmscf ?? r.standardised.derivedVolumeMmscf;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {formatDecimal(value)} <span className="text-muted-foreground">MMscf</span>
      {r.standardised.totalVolumeMmscf === null && (
        <span className="ml-1 text-xs text-muted-foreground">(derived)</span>
      )}
    </span>
  );
}

/** Size of one queue, for its tab. Shares the cache with the list when on page 1. */
function useQueueCount(orgId: string, queue: Queue) {
  const query = useActivityList(orgId, { page: 1, pageSize: PAGE_SIZE, ...queue.params });
  return query.data?.meta.total;
}

/**
 * Review and approval queues across all facilities (ARCHITECTURAL_WORKFLOW.md §7.1).
 * Which tabs appear follows the user's roles as a display aid; what they may do with
 * each record comes from the API, which checks again on every action.
 */
export function ReviewPage() {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const queues = QUEUES.filter((q) =>
    q.id === 'approval' ? organisation.canApproveActivity : organisation.canReviewActivity,
  );
  const [params, setParams] = useSearchParams();
  const current = queues.find((q) => q.id === params.get('queue')) ?? queues[0];
  const canCalculations = organisation.canReviewCalculation || organisation.canApproveCalculation;
  const kind =
    params.get('kind') === 'calculations' && canCalculations ? 'calculations' : 'records';

  if (!current && !canCalculations) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Review</h1>
        <EmptyState
          title="Review queues are for reviewers and approvers"
          description="Your roles in this organisation don’t include reviewing or approving activity data."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Review</h1>
        <p className="text-sm text-muted-foreground">
          Activity records and emissions calculations moving from submission to approval. Only
          approved records and calculations will feed official reports.
        </p>
      </header>

      {canCalculations && (
        <div
          className="inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="What to review"
        >
          {(
            [
              ['records', 'Activity records'],
              ['calculations', 'Calculations'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={kind === value ? 'selected' : 'ghost'}
              aria-pressed={kind === value}
              onClick={() => {
                setParams(value === 'records' ? {} : { kind: value }, { replace: true });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {kind === 'calculations' ? (
        <CalculationQueues />
      ) : !current ? (
        <EmptyState title="Your roles don’t include reviewing or approving activity data" />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Review queues"
            className="flex gap-1 overflow-x-auto border-b"
          >
            {queues.map((q) => (
              <QueueTab
                key={q.id}
                orgId={orgId}
                queue={q}
                selected={q.id === current.id}
                onSelect={() => {
                  setParams({ queue: q.id }, { replace: true });
                }}
              />
            ))}
          </div>

          <QueuePanel key={current.id} orgId={orgId} queue={current} />
        </>
      )}
    </div>
  );
}

function QueueTab({
  orgId,
  queue,
  selected,
  onSelect,
}: {
  orgId: string;
  queue: Queue;
  selected: boolean;
  onSelect: () => void;
}) {
  const count = useQueueCount(orgId, queue);
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${queue.id}`}
      aria-selected={selected}
      aria-controls={`panel-${queue.id}`}
      onClick={onSelect}
      className={cn(
        '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {queue.label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 text-xs tabular-nums',
            count > 0 ? 'bg-warning/15 text-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

function QueuePanel({ orgId, queue }: { orgId: string; queue: Queue }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = useActivityList(orgId, { page, pageSize: PAGE_SIZE, ...queue.params });
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selection = useSelection(rows);
  const selecting = selection.selectable.length > 0;

  const goTo = (p: number) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p > 1) next.set('page', String(p));
        else next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  return (
    <section
      role="tabpanel"
      id={`panel-${queue.id}`}
      aria-labelledby={`tab-${queue.id}`}
      className="space-y-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{queue.description}</p>
        {query.isFetching && !query.isPending && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Updating…
          </span>
        )}
      </div>

      {query.isPending ? (
        <TableSkeleton columns={6} rows={3} label={`Loading ${queue.label.toLowerCase()}`} />
      ) : query.isError ? (
        <ErrorState
          title="Could not load this queue"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={queue.empty} />
      ) : (
        <>
          <BulkActionBar selection={selection} />
          <div className="rounded-md border bg-card">
            <Table>
              <caption className="sr-only">
                {queue.label}. Volumes are standardised to 15 °C and 101.325 kPa (ISO 13443).
              </caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {selecting && (
                    <TableHead className="w-8">
                      <SelectAllCheckbox selection={selection} />
                    </TableHead>
                  )}
                  <TableHead>Period</TableHead>
                  <TableHead>Flare source</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Volume <span className="normal-case">(MMscf, ISO 13443)</span>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">Warnings</TableHead>
                  <TableHead className="hidden md:table-cell">Submitted</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={selection.isSelected(r.id) ? 'bg-accent/40' : undefined}
                  >
                    {selecting && (
                      <TableCell className="w-8">
                        <SelectRowCheckbox selection={selection} record={r} />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        to={`/o/${orgId}/activity-records/${r.id}`}
                        className="row-link whitespace-nowrap"
                      >
                        {periodLabel(r)}
                      </Link>
                      {r.version > 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">v{r.version}</span>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                        <ActivityTypeBadge type={r.activityType} />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <span className="block truncate">{r.flareSource.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.flareSource.code} · {r.flareSource.facilityName}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ActivityTypeBadge type={r.activityType} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <StandardVolume r={r} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <WarningCount warnings={r.warnings} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground tabular-nums md:table-cell">
                      {r.submittedAt ? formatDateTime(r.submittedAt) : '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <ActivityStatusBadge status={r.status} />
                      {r.separationOfDuties && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Someone else must act
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav
            aria-label={`${queue.label} pages`}
            className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row"
          >
            <p className="text-muted-foreground" aria-live="polite">
              {formatCount(total)} record{total === 1 ? '' : 's'}
            </p>
            {lastPage > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => {
                    goTo(page - 1);
                  }}
                >
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {page} of {lastPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage || query.isFetching}
                  onClick={() => {
                    goTo(page + 1);
                  }}
                >
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
