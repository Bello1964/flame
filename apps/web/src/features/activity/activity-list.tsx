import { useSearchParams, Link } from 'react-router';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  ACTIVITY_TYPES,
  RATE_UNIT_LABELS,
  VOLUME_UNIT_LABELS,
  type ActivityRecordDto,
  type ActivityType,
} from '@flame/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
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
import { formatCount, formatDecimal } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useActivityList, type ActivityStatusFilter } from './api';
import { ActivityStatusBadge, ActivityTypeBadge, WarningCount } from './badges';
import { ACTIVITY_TYPE_LABELS, BASIS_LABELS, periodLabel } from './labels';

const PAGE_SIZE = 25;

function parseType(v: string | null): ActivityType | undefined {
  return ACTIVITY_TYPES.find((t) => t === v);
}
function parseStatus(v: string | null): ActivityStatusFilter {
  return v === 'WITHDRAWN' || v === 'ALL' ? v : 'DRAFT';
}

/** The quantity as entered, with its unit; never mixed with standardised values. */
function Entered({ q }: { q: { entered: string; unit: string } | null }) {
  return q ? (
    <span className="tabular-nums">
      {q.entered} <span className="text-muted-foreground">{q.unit}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

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

/**
 * Activity records of one flare source. Filters live in the URL (?atype=&astatus=&apage=),
 * separate from the hierarchy list's parameters; filtering and paging happen on the server.
 */
export function ActivityList({
  flareSourceId,
  emptyAction,
  emptyDescription,
}: {
  flareSourceId: string;
  emptyAction?: React.ReactNode;
  emptyDescription: string;
}) {
  const { organisationId } = useOrganisation();
  const [params, setParams] = useSearchParams();
  const activityType = parseType(params.get('atype'));
  const status = parseStatus(params.get('astatus'));
  const page = Math.max(1, Number(params.get('apage')) || 1);

  const query = useActivityList(organisationId, {
    page,
    pageSize: PAGE_SIZE,
    status,
    flareSourceId,
    ...(activityType ? { activityType } : {}),
  });

  const set = (changes: Record<string, string | undefined>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('apage' in changes)) next.delete('apage');
        return next;
      },
      { replace: true },
    );
  };

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = activityType !== undefined || status !== 'DRAFT';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <NativeSelect
          aria-label="Filter by activity type"
          className="sm:w-56"
          value={activityType ?? ''}
          onChange={(e) => {
            set({ atype: e.target.value || undefined });
          }}
        >
          <option value="">All activity types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by status"
          className="sm:w-44"
          value={status}
          onChange={(e) => {
            set({ astatus: e.target.value === 'DRAFT' ? undefined : e.target.value });
          }}
        >
          <option value="DRAFT">Drafts</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="ALL">All statuses</option>
        </NativeSelect>
        {query.isFetching && !query.isPending && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Updating…
          </span>
        )}
      </div>

      {query.isPending ? (
        <TableSkeleton columns={6} rows={3} label="Loading activity records" />
      ) : query.isError ? (
        <ErrorState
          title="Could not load activity records"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No activity records match these filters"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  set({ atype: undefined, astatus: undefined });
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No activity recorded yet"
            description={emptyDescription}
            action={emptyAction}
          />
        )
      ) : (
        <>
          <div className="rounded-md border bg-card">
            <Table>
              <caption className="sr-only">
                Activity records. Entered values are shown as entered; standardised volume is at 15
                °C and 101.325 kPa (ISO 13443).
              </caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Rate (entered)</TableHead>
                  <TableHead className="hidden md:table-cell">Volume (entered)</TableHead>
                  <TableHead>
                    Volume{' '}
                    <span className="normal-case">
                      (MMscf, ISO<span className="hidden sm:inline"> 13443</span>)
                    </span>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Basis</TableHead>
                  <TableHead className="hidden sm:table-cell">Warnings</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        to={`/o/${organisationId}/activity-records/${r.id}`}
                        className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {periodLabel(r)}
                      </Link>
                      {/* On phones, type (and withdrawn status) sit under the period. */}
                      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        <ActivityTypeBadge type={r.activityType} />
                        {r.status === 'WITHDRAWN' && <ActivityStatusBadge status={r.status} />}
                        {r.warnings.some((w) => w.code !== 'NO_EVIDENCE') && (
                          <WarningCount warnings={r.warnings} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <ActivityTypeBadge type={r.activityType} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Entered
                        q={
                          r.averageRate && {
                            entered: r.averageRate.entered,
                            unit: RATE_UNIT_LABELS[r.averageRate.unit],
                          }
                        }
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Entered
                        q={
                          r.totalVolume && {
                            entered: r.totalVolume.entered,
                            unit: VOLUME_UNIT_LABELS[r.totalVolume.unit],
                          }
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StandardVolume r={r} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {BASIS_LABELS[r.measurementBasis]}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <WarningCount warnings={r.warnings} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <ActivityStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav
            aria-label="Activity record pages"
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
                    set({ apage: page > 2 ? String(page - 1) : undefined });
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
                    set({ apage: String(page + 1) });
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
    </div>
  );
}
