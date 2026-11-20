import { CheckCircle2, History, Hourglass, XCircle, type LucideIcon } from 'lucide-react';
import type { IssuedReportStatus, IssuedReportSummaryDto } from '@flame/shared';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

const STATUS_STYLE: Record<
  IssuedReportStatus,
  { label: string; icon: LucideIcon; variant: BadgeVariant }
> = {
  AWAITING_APPROVAL: { label: 'Awaiting approval', icon: Hourglass, variant: 'pending' },
  APPROVED: { label: 'Approved', icon: CheckCircle2, variant: 'success' },
  REJECTED: { label: 'Rejected', icon: XCircle, variant: 'destructive' },
  SUPERSEDED: { label: 'Superseded', icon: History, variant: 'muted' },
};

/** An issued report's status, as text and icon. "Approved" says whether it was submitted. */
export function StatusBadge({ report }: { report: IssuedReportSummaryDto }) {
  const { label, icon: Icon, variant } = STATUS_STYLE[report.status];
  const text =
    report.status === 'APPROVED'
      ? report.submittedOn
        ? 'Approved · submitted'
        : 'Approved · not submitted'
      : label;
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      <Icon aria-hidden />
      {text}
    </Badge>
  );
}
