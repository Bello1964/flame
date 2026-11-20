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
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { CALCULATION_STATUS_LABELS, EDITION_STATUS_LABELS, QUALITY_LABELS } from './labels';

const STATUS_STYLE: Record<CalculationStatus, { icon: LucideIcon; variant: BadgeVariant }> = {
  CALCULATED: { icon: Sigma, variant: 'outline' },
  SUBMITTED: { icon: Send, variant: 'pending' },
  UNDER_REVIEW: { icon: Eye, variant: 'pending' },
  AWAITING_APPROVAL: { icon: Hourglass, variant: 'pending' },
  APPROVED: { icon: CheckCircle2, variant: 'success' },
  REJECTED: { icon: XCircle, variant: 'destructive' },
  SUPERSEDED: { icon: History, variant: 'muted' },
  DISCARDED: { icon: Ban, variant: 'muted' },
};

/** Only an approved calculation uses Success; nothing pending can look approved. */
export function CalculationStatusBadge({ status }: { status: CalculationStatus }) {
  const { icon: Icon, variant } = STATUS_STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {CALCULATION_STATUS_LABELS[status]}
    </Badge>
  );
}

/** How the result was obtained, always next to the figure. Estimated is flagged as info. */
export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  return quality === 'MEASURED_BASIS' ? (
    <Badge variant="secondary">
      <Gauge aria-hidden />
      {QUALITY_LABELS[quality]}
    </Badge>
  ) : (
    <Badge variant="info">
      <FlaskConical aria-hidden />
      {QUALITY_LABELS[quality]}
    </Badge>
  );
}

export function EditionStatusBadge({ status }: { status: MethodologyEditionStatus }) {
  const variant: BadgeVariant =
    status === 'APPROVED' ? 'success' : status === 'DRAFT' ? 'pending' : 'muted';
  return <Badge variant={variant}>{EDITION_STATUS_LABELS[status]}</Badge>;
}
