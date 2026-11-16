import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalculationStatus } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCount, formatDateTime, formatDecimal } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { periodLabel } from '@/features/activity/labels';
import { useCalculations, type CalculationListParams } from './api';
import { CalculationStatusBadge, DataQualityBadge } from './badges';
import { ROUTE_LABELS } from './labels';

const PAGE_SIZE = 25;

interface Queue {
  id: 'to-review' | 'mine' | 'approval';
  label: string;
  description: string;
  empty: string;
  params: { status: CalculationStatus; claimedBy?: 'me'; sort: 'submitted' };
}

const QUEUES: Queue[] = [
  {
    id: 'to-review',
    label: 'To review',
    description:
      'Submitted calculations, longest-waiting first. You can’t review a calculation you ran or submitted.',
    empty: 'No calculations are waiting for review.',
    params: { status: 'SUBMITTED', sort: 'submitted' },
  },
  {
    id: 'mine',
    label: 'My reviews',
    description: 'Calculations you are reviewing: check the inputs and the step-by-step trace.',
    empty: 'You aren’t reviewing any calculations.',
    params: { status: 'UNDER_REVIEW', claimedBy: 'me', sort: 'submitted' },
  },
  {
    id: 'approval',
    label: 'Awaiting approval',
    description: 'Reviewed calculations waiting for a decision.',
    empty: 'No calculations are waiting for approval.',
    params: { status: 'AWAITING_APPROVAL', sort: 'submitted' },
  },
];

function Tab({
  queue,
  selected,
  onSelect,
}: {
  queue: Queue;
  selected: boolean;
  onSelect: () => void;
}) {
  const { organisationId } = useOrganisation();
  const count = useCalculations(organisationId, { page: 1, pageSize: PAGE_SIZE, ...queue.params })
    .data?.meta.total;
  return (
    <button
      type="button"
      role="tab"
      id={`calc-tab-${queue.id}`}
      aria-selected={selected}
      aria-controls={`calc-panel-${queue.id}`}
      onClick={onSelect}
      className={cn(
        '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
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

function Panel({ queue }: { queue: Queue }) {
  const { organisationId } = useOrganisation();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const listParams: CalculationListParams = { page, pageSize: PAGE_SIZE, ...queue.params };
  const query = useCalculations(organisationId, listParams);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
      id={`calc-panel-${queue.id}`}
      aria-labelledby={`calc-tab-${queue.id}`}
      className="space-y-3"
    >
      <p className="text-sm text-muted-foreground">{queue.description}</p>
      {query.isPending ? (
        <TableSkeleton columns={5} rows={3} label={`Loading ${queue.label.toLowerCase()}`} />
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
          <div className="rounded-md border bg-card">
            <Table>
              <caption className="sr-only">{queue.label}: emissions calculations.</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead>Flare source</TableHead>
                  <TableHead className="text-right">tCO₂e</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="hidden sm:table-cell">Basis</TableHead>
                  <TableHead className="hidden lg:table-cell">Submitted</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to={`/o/${organisationId}/calculations/${c.id}`}
                        className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
                      >
                        {periodLabel({
                          kind: c.activity.kind,
                          periodStart: c.activity.periodStart,
                          periodEnd: c.activity.periodEnd,
                        })}
                      </Link>
                      <span className="ml-1 text-xs text-muted-foreground">v{c.version}</span>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <span className="block truncate">{c.flareSource.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.flareSource.code} · {c.flareSource.facilityName}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={`Exact: ${c.results.co2eTonnes} tCO₂e`}
                    >
                      {formatDecimal(c.results.co2eTonnes, 3)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{ROUTE_LABELS[c.route]}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <DataQualityBadge quality={c.dataQuality} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                      {c.submittedAt ? formatDateTime(c.submittedAt) : '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <CalculationStatusBadge status={c.status} />
                      {c.separationOfDuties && (
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
          {lastPage > 1 && (
            <nav
              aria-label={`${queue.label} pages`}
              className="flex items-center justify-end gap-2 text-sm"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
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
                disabled={page >= lastPage}
                onClick={() => {
                  goTo(page + 1);
                }}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

/** Calculation review queues for the Review page; tabs follow the user's roles (a display aid). */
export function CalculationQueues() {
  const organisation = useOrganisation();
  const queues = QUEUES.filter((q) =>
    q.id === 'approval' ? organisation.canApproveCalculation : organisation.canReviewCalculation,
  );
  const [params, setParams] = useSearchParams();
  const current = queues.find((q) => q.id === params.get('queue')) ?? queues[0];
  if (!current) {
    return <EmptyState title="Your roles don’t include reviewing or approving calculations" />;
  }
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Calculation review queues"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {queues.map((q) => (
          <Tab
            key={q.id}
            queue={q}
            selected={q.id === current.id}
            onSelect={() => {
              setParams({ kind: 'calculations', queue: q.id }, { replace: true });
            }}
          />
        ))}
      </div>
      <Panel key={current.id} queue={current} />
    </div>
  );
}
