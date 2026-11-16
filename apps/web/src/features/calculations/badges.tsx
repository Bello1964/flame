import {
  Ban,
  CheckCircle2,
  Eye,
  FlaskConical,
  Gauge,
  History,
  Hourglass,
  Send,
  Sigma,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { CalculationStatus, DataQuality, MethodologyEditionStatus } from '@flame/shared';
import { Badge } from '@/components/ui/badge';
import { CALCULATION_STATUS_LABELS, EDITION_STATUS_LABELS, QUALITY_LABELS } from './labels';

const PENDING = 'border-warning/50 bg-warning/10 text-foreground';

const STATUS_STYLE: Record<
  CalculationStatus,
  { icon: LucideIcon; variant: 'default' | 'outline' | 'muted'; className?: string }
> = {
  CALCULATED: { icon: Sigma, variant: 'outline' },
  SUBMITTED: { icon: Send, variant: 'outline', className: PENDING },
  UNDER_REVIEW: { icon: Eye, variant: 'outline', className: PENDING },
  AWAITING_APPROVAL: { icon: Hourglass, variant: 'outline', className: PENDING },
  APPROVED: { icon: CheckCircle2, variant: 'default' },
  REJECTED: {
    icon: XCircle,
    variant: 'outline',
    className: 'border-destructive/40 text-destructive',
  },
  SUPERSEDED: { icon: History, variant: 'muted' },
  DISCARDED: { icon: Ban, variant: 'muted' },
};

/** Only an approved calculation uses the primary colour; nothing pending can look approved. */
export function CalculationStatusBadge({ status }: { status: CalculationStatus }) {
  const { icon: Icon, variant, className } = STATUS_STYLE[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {CALCULATION_STATUS_LABELS[status]}
    </Badge>
  );
}

/** How the result was obtained, always next to the figure. */
export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  return quality === 'MEASURED_BASIS' ? (
    <Badge variant="secondary">
      <Gauge aria-hidden />
      {QUALITY_LABELS[quality]}
    </Badge>
  ) : (
    <Badge variant="outline" className={PENDING}>
      <FlaskConical aria-hidden />
      {QUALITY_LABELS[quality]}
    </Badge>
  );
}

export function EditionStatusBadge({ status }: { status: MethodologyEditionStatus }) {
  const variant = status === 'APPROVED' ? 'default' : status === 'DRAFT' ? 'outline' : 'muted';
  return (
    <Badge variant={variant} className={status === 'DRAFT' ? PENDING : undefined}>
      {EDITION_STATUS_LABELS[status]}
    </Badge>
  );
}
