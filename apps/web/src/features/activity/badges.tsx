import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileText,
  Flame,
  History,
  Hourglass,
  Send,
  Undo2,
  Wind,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityRecordStatus, ActivityType, ActivityWarning } from '@flame/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACTIVITY_TYPE_LABELS, STATUS_LABELS, isFlaring } from './labels';

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

const PENDING = 'border-warning/50 bg-warning/10 text-foreground';

/**
 * Every status has its own label and icon, so it never depends on colour alone. Amber
 * marks records waiting on someone; only Approved uses the primary colour, so nothing
 * submitted can be mistaken for approved.
 */
const STATUS_STYLE: Record<
  ActivityRecordStatus,
  { icon: LucideIcon; variant: 'default' | 'outline' | 'muted'; className?: string }
> = {
  DRAFT: { icon: FileText, variant: 'outline' },
  SUBMITTED: { icon: Send, variant: 'outline', className: PENDING },
  UNDER_REVIEW: { icon: Eye, variant: 'outline', className: PENDING },
  AWAITING_APPROVAL: { icon: Hourglass, variant: 'outline', className: PENDING },
  NEEDS_CORRECTION: {
    icon: Undo2,
    variant: 'outline',
    className: 'border-warning bg-warning/20 text-foreground',
  },
  APPROVED: { icon: CheckCircle2, variant: 'default' },
  REJECTED: {
    icon: XCircle,
    variant: 'outline',
    className: 'border-destructive/40 text-destructive',
  },
  SUPERSEDED: { icon: History, variant: 'muted' },
  WITHDRAWN: { icon: Ban, variant: 'muted' },
};

export function ActivityStatusBadge({ status }: { status: ActivityRecordStatus }) {
  const { icon: Icon, variant, className } = STATUS_STYLE[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
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
