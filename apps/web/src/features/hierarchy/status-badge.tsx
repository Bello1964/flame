import { Archive, CircleCheck } from 'lucide-react';
import type { RecordStatus } from '@carbon/shared';
import { Badge } from '@/components/ui/badge';

/** Status as text plus icon, never colour alone. */
export function StatusBadge({ status }: { status: RecordStatus }) {
  return status === 'ACTIVE' ? (
    <Badge variant="secondary">
      <CircleCheck aria-hidden />
      Active
    </Badge>
  ) : (
    <Badge variant="muted">
      <Archive aria-hidden />
      Archived
    </Badge>
  );
}
