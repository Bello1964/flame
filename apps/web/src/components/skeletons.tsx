import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading placeholders shaped like the content they stand in for, so the page keeps its
 * layout and nothing jumps when data arrives. Each region announces itself once to
 * assistive technology; the shapes themselves are hidden from it.
 */
function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/** A table with a header row and `rows` body rows; the first column is widest, like names. */
export function TableSkeleton({
  columns = 4,
  rows = 5,
  label = 'Loading records',
}: {
  columns?: number;
  rows?: number;
  label?: string;
}) {
  const cells = Array.from({ length: columns }, (_, i) => i);
  return (
    <Busy label={label} className="block overflow-hidden rounded-md border bg-card">
      <div className="flex h-10 items-center gap-6 border-b px-3">
        {cells.map((i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === 0 ? 'w-24' : 'w-14', i > 2 && 'max-md:hidden')}
          />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-6 border-b px-3 last:border-0">
          {cells.map((i) => (
            <Skeleton
              key={i}
              className={cn(
                'h-4',
                i === 0 ? 'w-40' : i === columns - 1 ? 'w-16 rounded-full' : 'w-20',
                i > 2 && i < columns - 1 && 'max-md:hidden',
              )}
              // Vary widths a little so the rows read as text, not stripes.
              style={i === 0 ? { width: `${8 + ((r * 3) % 5)}rem` } : undefined}
            />
          ))}
        </div>
      ))}
    </Busy>
  );
}

/** Search box, status filter and table, matching RecordList. */
export function RecordListSkeleton({ columns, label }: { columns: number; label: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row" aria-hidden>
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-full sm:w-40" />
      </div>
      <TableSkeleton columns={columns} label={label} />
    </div>
  );
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

/** Email and password fields and the sign-in button, matching LoginForm. */
export function LoginFormSkeleton() {
  return (
    <Busy label="Loading sign-in form" className="grid gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="mt-2 h-9 w-full" />
    </Busy>
  );
}

/** A list page: title, description, primary action, filters and table. */
export function ListPageSkeleton() {
  return (
    <Busy label="Loading page" className="block space-y-6">
      <HeaderSkeleton />
      <RecordListSkeleton columns={5} label="Loading records" />
    </Busy>
  );
}

/** A record page: breadcrumbs, title block, detail fields and a child list. */
export function RecordPageSkeleton({ label = 'Loading record' }: { label?: string }) {
  return (
    <Busy label={label} className="block space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-56" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-x-8 gap-y-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <HeaderSkeleton />
        <TableSkeleton columns={4} rows={3} label="Loading related records" />
      </div>
    </Busy>
  );
}

/**
 * The application shell before anything is known: the dark sidebar with placeholder
 * organisation, navigation and account rows, and a page skeleton beside it.
 */
export function AppShellSkeleton() {
  return (
    <Busy
      label="Loading Carbon Accounting"
      className="block min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0">
        <div className="px-4 pt-4 pb-3">
          <p className="text-sm font-semibold tracking-wide">Carbon Accounting</p>
          <p className="text-xs opacity-70">Emissions management</p>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3">
          <Skeleton className="size-4 bg-white/10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32 bg-white/10" />
            <Skeleton className="h-3 w-20 bg-white/10" />
          </div>
        </div>
        <div className="flex gap-1 px-2 pb-3 md:flex-1 md:flex-col">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-9 w-28 bg-white/10 md:w-full" />
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <Skeleton className="size-7 rounded-full bg-white/10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24 bg-white/10" />
            <Skeleton className="h-3 w-36 bg-white/10" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="space-y-6">
          <HeaderSkeleton />
          <RecordListSkeleton columns={5} label="Loading records" />
        </div>
      </div>
    </Busy>
  );
}
