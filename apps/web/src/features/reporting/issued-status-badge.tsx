import type { IssuedReportStatus, IssuedReportSummaryDto } from '@flame/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_LABELS: Record<IssuedReportStatus, string> = {
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
};

export function StatusBadge({ report }: { report: IssuedReportSummaryDto }) {
  const label =
    report.status === 'APPROVED'
      ? report.submittedOn
        ? 'Approved · submitted'
        : 'Approved · not submitted'
      : STATUS_LABELS[report.status];
  return (
    <Badge
      variant={report.status === 'APPROVED' ? 'default' : 'secondary'}
      className="whitespace-nowrap"
    >
      {label}
    </Badge>
  );
}
