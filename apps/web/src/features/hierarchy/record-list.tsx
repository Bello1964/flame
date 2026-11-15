import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/page-state';
import { formatCount } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { TableSkeleton } from '@/components/skeletons';
import { preloadPage, type PageName } from '@/app/lazy-pages';
import {
  PAGE_SIZE,
  useHierarchyList,
  usePrefetchRecordPage,
  type DtoByResource,
  type HierarchyResource,
  type ListParams,
  type StatusFilter,
} from './api';
import { StatusBadge } from './status-badge';

const DETAIL_PAGE: Record<HierarchyResource, PageName> = {
  facilities: 'facility',
  assets: 'asset',
  'flare-sources': 'flareSource',
};
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'ALL', label: 'All statuses' },
];

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Hide on narrow screens; name, code and status always show. */
  hideOnMobile?: boolean;
}

function parseStatus(value: string | null): StatusFilter {
  return value === 'ARCHIVED' || value === 'ALL' ? value : 'ACTIVE';
}

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * Filter state lives in the URL (?q=&status=&page=) so it survives navigation and
 * can be shared. Search, filtering and paging all happen on the server.
 */
function useListState() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = parseStatus(params.get('status'));
  const page = parsePage(params.get('page'));

  const update = (changes: { q?: string; status?: StatusFilter; page?: number }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const set = (key: string, value: string | undefined) => {
          if (value) next.set(key, value);
          else next.delete(key);
        };
        if (changes.q !== undefined) set('q', changes.q.trim() || undefined);
        if (changes.status !== undefined)
          set('status', changes.status === 'ACTIVE' ? undefined : changes.status);
        // Any filter change returns to the first page.
        const nextPage = changes.page ?? 1;
        set('page', nextPage > 1 ? String(nextPage) : undefined);
        return next;
      },
      { replace: true },
    );
  };

  return { q, status, page, update };
}

function SearchInput({
  value,
  onSearch,
  label,
}: {
  value: string;
  onSearch: (q: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Follow external changes (e.g. "Clear filters"), not the echo of our own search.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== draft.trim()) setDraft(value);
  }

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = setTimeout(() => {
      onSearch(draft);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, value, onSearch]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        placeholder="Search name or code"
        aria-label={label}
        maxLength={100}
        className="pl-9"
      />
    </div>
  );
}

interface RecordListProps<R extends HierarchyResource> {
  resource: R;
  /** Plural label for headings and messages, e.g. "assets". */
  label: string;
  columns: Column<DtoByResource[R]>[];
  detailPath: (row: DtoByResource[R]) => string;
  parentFilter?: Pick<ListParams, 'facilityId' | 'assetId'>;
  /** Shown in the empty state when nothing exists yet (e.g. an "Add" button). */
  emptyAction?: ReactNode;
  emptyDescription?: string;
}

export function RecordList<R extends HierarchyResource>({
  resource,
  label,
  columns,
  detailPath,
  parentFilter,
  emptyAction,
  emptyDescription,
}: RecordListProps<R>) {
  const { organisationId } = useOrganisation();
  const { q, status, page, update } = useListState();
  // Same shape as firstPageParams(), so a prefetched first page is reused as-is.
  const query = useHierarchyList(organisationId, resource, {
    page,
    pageSize: PAGE_SIZE,
    status,
    ...(q ? { q } : {}),
    ...parentFilter,
  });
  const prefetchRecordPage = usePrefetchRecordPage();
  const prefetch = (id: string) => {
    preloadPage(DETAIL_PAGE[resource]);
    prefetchRecordPage(organisationId, resource, id);
  };

  const filtered = q !== '' || status !== 'ACTIVE';
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={q}
          onSearch={(next) => {
            update({ q: next, status });
          }}
          label={`Search ${label}`}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            update({ q, status: parseStatus(v) });
          }}
        >
          <SelectTrigger className="sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {query.isFetching && !query.isPending && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Updating…
          </span>
        )}
      </div>

      {query.isPending ? (
        <TableSkeleton columns={columns.length + 3} label={`Loading ${label}`} />
      ) : query.isError ? (
        <ErrorState
          title={`Could not load ${label}`}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        page > 1 ? (
          <EmptyState
            title="This page is empty"
            description={`There are ${formatCount(total)} matching ${label}.`}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  update({ q, status, page: 1 });
                }}
              >
                Go to first page
              </Button>
            }
          />
        ) : filtered ? (
          <EmptyState
            title={`No ${label} match these filters`}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  update({ q: '', status: 'ACTIVE' });
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`No ${label} yet`}
            description={emptyDescription}
            action={emptyAction}
          />
        )
      ) : (
        <>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  {columns.map((col) => (
                    <TableHead
                      key={col.header}
                      className={col.hideOnMobile ? 'hidden md:table-cell' : undefined}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-64">
                      <Link
                        to={detailPath(row)}
                        onMouseEnter={() => {
                          prefetch(row.id);
                        }}
                        onFocus={() => {
                          prefetch(row.id);
                        }}
                        onTouchStart={() => {
                          prefetch(row.id);
                        }}
                        className="block truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    {columns.map((col) => (
                      <TableCell
                        key={col.header}
                        className={col.hideOnMobile ? 'hidden md:table-cell' : undefined}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <nav
            aria-label={`${label} pages`}
            className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row"
          >
            <p className="text-muted-foreground" aria-live="polite">
              Showing {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
            </p>
            {lastPage > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => {
                    update({ q, status, page: page - 1 });
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
                    update({ q, status, page: page + 1 });
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

/** Placeholder for a value that was never recorded, distinct from an empty string. */
export function NotRecorded() {
  return <span className="text-muted-foreground">Not recorded</span>;
}
