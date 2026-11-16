import { Link } from 'react-router';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { ActivityRecordEventDto } from '@flame/shared';
import { ErrorState } from '@/components/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useActivityHistory } from './api';
import { ActivityStatusBadge } from './badges';
import { EVENT_LABELS } from './labels';

/** Where a related record (revision or the record revised) sits relative to this one. */
function relatedLabel(e: ActivityRecordEventDto): string {
  switch (e.type) {
    case 'REVISION_CREATED':
      return 'Open the revision';
    case 'SUPERSEDED':
      return 'Open the approved revision';
    default:
      return 'Open the record this revises';
  }
}

function Entry({ e }: { e: ActivityRecordEventDto }) {
  const { organisationId } = useOrganisation();
  const moved = e.fromStatus !== null && e.fromStatus !== e.toStatus;
  const serious = (e.warnings ?? []).filter((w) => w.code !== 'NO_EVIDENCE');
  return (
    <li className="relative pb-5 pl-6 last:pb-0">
      <span
        className="absolute top-1.5 left-0 size-2.5 rounded-full border-2 border-primary bg-background"
        aria-hidden
      />
      <span className="absolute top-4 bottom-0 left-[4px] w-px bg-border" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{EVENT_LABELS[e.type]}</span>
        <span className="text-muted-foreground">by {e.actor.name}</span>
        <time className="text-xs text-muted-foreground tabular-nums" dateTime={e.createdAt}>
          {formatDateTime(e.createdAt)}
        </time>
      </div>
      {moved && e.fromStatus && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <ActivityStatusBadge status={e.fromStatus} />
          <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" />
          <ActivityStatusBadge status={e.toStatus} />
        </div>
      )}
      {e.comment && (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm whitespace-pre-line">
          {e.comment}
        </blockquote>
      )}
      {e.warnings && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {serious.length > 0 && <AlertTriangle className="size-3.5 text-warning" aria-hidden />}
          {serious.length > 0
            ? `Warnings at the time: ${serious.map((w) => w.message).join('; ')}`
            : 'No data-quality warnings at the time, apart from missing evidence'}
        </p>
      )}
      {e.relatedRecordId && (
        <Link
          to={`/o/${organisationId}/activity-records/${e.relatedRecordId}`}
          className="mt-1 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          {relatedLabel(e)}
        </Link>
      )}
    </li>
  );
}

/** Every edit, workflow step and comment on the record, oldest first. Append-only. */
export function HistoryTimeline({ recordId }: { recordId: string }) {
  const { organisationId } = useOrganisation();
  const history = useActivityHistory(organisationId, recordId);

  if (history.isPending) {
    return (
      <div role="status" aria-label="Loading history" className="space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-52" />
      </div>
    );
  }
  if (history.isError) {
    return (
      <ErrorState
        title="Could not load the history"
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  }
  return (
    <ol className="rounded-md border bg-card p-4" aria-label="Record history">
      {history.data.map((e) => (
        <Entry key={e.id} e={e} />
      ))}
    </ol>
  );
}
