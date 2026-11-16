import { AlertTriangle, Ban, FileText, Flame, Wind } from 'lucide-react';
import type { ActivityRecordStatus, ActivityType, ActivityWarning } from '@carbon/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACTIVITY_TYPE_LABELS, isFlaring } from './labels';

/** Activity type with an icon; flaring and venting/other releases look different. */
export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  const flaring = isFlaring(type);
  return (
    <Badge variant={flaring ? 'secondary' : 'outline'} className="font-normal">
      {flaring ? <Flame aria-hidden /> : <Wind aria-hidden />}
      {ACTIVITY_TYPE_LABELS[type]}
    </Badge>
  );
}

export function ActivityStatusBadge({ status }: { status: ActivityRecordStatus }) {
  return status === 'DRAFT' ? (
    <Badge variant="outline">
      <FileText aria-hidden />
      Draft
    </Badge>
  ) : (
    <Badge variant="muted">
      <Ban aria-hidden />
      Withdrawn
    </Badge>
  );
}

/**
 * Count of data-quality warnings, in amber. "No evidence" alone is shown quietly, since
 * every record carries it until evidence uploads exist.
 */
export function WarningCount({ warnings }: { warnings: ActivityWarning[] }) {
  const serious = warnings.filter((w) => w.code !== 'NO_EVIDENCE');
  if (warnings.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        serious.length > 0 ? 'font-medium text-warning' : 'text-muted-foreground',
      )}
      title={warnings.map((w) => w.message).join('\n')}
    >
      {serious.length > 0 && <AlertTriangle className="size-3.5" aria-hidden />}
      {serious.length > 0
        ? `${String(serious.length)} warning${serious.length === 1 ? '' : 's'}`
        : 'No evidence'}
    </span>
  );
}
