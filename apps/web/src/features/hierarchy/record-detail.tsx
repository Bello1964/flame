import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Archive, ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/page-state';
import { RecordPageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from './status-badge';
import { NotRecorded } from './record-list';
import type { RecordStatus } from '@carbon/shared';

export interface Crumb {
  /** Null while the name is still loading; a placeholder shape is shown instead. */
  label: string | null;
  to?: string;
}

/** A word-sized placeholder for a name that is still loading (e.g. a parent record's). */
export function InlineSkeleton() {
  return (
    <span className="inline-flex align-middle">
      <span className="sr-only">Loading</span>
      <Skeleton aria-hidden className="inline-block h-3.5 w-24" />
    </span>
  );
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => (
          // Crumbs are positional and never reordered, so the index is a stable key.
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            {item.label === null ? (
              <InlineSkeleton />
            ) : item.to ? (
              <Link to={item.to} className="truncate hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function RecordHeader({
  kind,
  name,
  code,
  status,
  actions,
}: {
  kind: string;
  name: string;
  code: string;
  status: RecordStatus;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{kind}</p>
        <h1 className="text-2xl font-semibold break-words">{name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{code}</span>
          <StatusBadge status={status} />
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function ArchivedNotice({
  label,
  archivedAt,
}: {
  label: string;
  archivedAt: string | null;
}) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
      <Archive className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>
        This {label} was archived{archivedAt ? ` on ${formatDateTime(archivedAt)}` : ''}. It is
        read-only and is kept for history.
      </span>
    </p>
  );
}

export interface DetailItem {
  label: string;
  value: ReactNode;
}

/** Definition list of a record's fields; null values show as "Not recorded". */
export function DetailList({
  items,
  timestamps,
}: {
  items: DetailItem[];
  /** Appends Created and Last updated rows. */
  timestamps?: { createdAt: string; updatedAt: string };
}) {
  const all = timestamps
    ? [
        ...items,
        { label: 'Created', value: formatDateTime(timestamps.createdAt) },
        { label: 'Last updated', value: formatDateTime(timestamps.updatedAt) },
      ]
    : items;
  return (
    <dl className="grid gap-x-8 gap-y-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      {all.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{item.value ?? <NotRecorded />}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Loading, not-found and error states for a record page. */
export function RecordPageState({
  error,
  label,
  backTo,
  backLabel,
  onRetry,
}: {
  error: unknown;
  label: string;
  backTo: string;
  backLabel: string;
  onRetry: () => void;
}) {
  if (!error) return <RecordPageSkeleton label={`Loading ${label}`} />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title={`${label.charAt(0).toUpperCase()}${label.slice(1)} not found`}
        description="It may not exist, or it may belong to a different organisation."
        action={
          <Button asChild variant="outline">
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        }
      />
    );
  }
  return <ErrorState title={`Could not load this ${label}`} error={error} onRetry={onRetry} />;
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
