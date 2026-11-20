import {
  Ban,
  CheckCircle2,
  CircleCheck,
  Clock,
  MailCheck,
  MailWarning,
  MailX,
  PauseCircle,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { EmailDeliveryStatus, InvitationStatus, MembershipStatus } from '@flame/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DELIVERY_DESCRIPTIONS,
  DELIVERY_LABELS,
  INVITATION_STATUS_LABELS,
  MEMBERSHIP_STATUS_LABELS,
} from './labels';

const PENDING = 'border-pending/40 bg-pending/8 text-pending';
const CAUTION = 'border-warning/45 bg-warning/8 text-warning';
const PROBLEM = 'border-destructive/40 bg-destructive/6 text-destructive';
const DONE = 'border-success/40 bg-success/8 text-success';

/** Every status has a label and an icon, never colour alone. */
const MEMBER_STYLE: Record<MembershipStatus, { icon: LucideIcon; className?: string }> = {
  ACTIVE: { icon: CircleCheck, className: DONE },
  SUSPENDED: { icon: PauseCircle, className: CAUTION },
  REMOVED: { icon: UserX, className: 'bg-muted text-muted-foreground' },
};

export function MemberStatusBadge({ status }: { status: MembershipStatus }) {
  const { icon: Icon, className } = MEMBER_STYLE[status];
  return (
    <Badge variant="outline" className={cn('font-normal', className)}>
      <Icon aria-hidden />
      {MEMBERSHIP_STATUS_LABELS[status]}
    </Badge>
  );
}

const INVITATION_STYLE: Record<InvitationStatus, { icon: LucideIcon; className?: string }> = {
  PENDING: { icon: Clock, className: PENDING },
  ACCEPTED: { icon: CheckCircle2, className: DONE },
  DECLINED: { icon: XCircle, className: 'bg-muted text-muted-foreground' },
  REVOKED: { icon: Ban, className: 'bg-muted text-muted-foreground' },
  EXPIRED: { icon: Clock, className: 'bg-muted text-muted-foreground' },
};

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const { icon: Icon, className } = INVITATION_STYLE[status];
  return (
    <Badge variant="outline" className={cn('font-normal', className)}>
      <Icon aria-hidden />
      {INVITATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const DELIVERY_STYLE: Record<EmailDeliveryStatus, { icon: LucideIcon; className?: string }> = {
  QUEUED: { icon: Clock, className: PENDING },
  SENT: { icon: MailCheck },
  FAILED: { icon: MailWarning, className: PROBLEM },
  CANCELLED: { icon: MailX, className: 'bg-muted text-muted-foreground' },
};

/** Delivery of the invitation email; null when no email was queued. */
export function DeliveryBadge({ delivery }: { delivery: EmailDeliveryStatus | null }) {
  if (!delivery) return <span className="text-xs text-muted-foreground">No email</span>;
  const { icon: Icon, className } = DELIVERY_STYLE[delivery];
  return (
    <Badge
      variant="outline"
      className={cn('font-normal', className)}
      title={DELIVERY_DESCRIPTIONS[delivery]}
    >
      <Icon aria-hidden />
      <span className="sr-only">Email: </span>
      {DELIVERY_LABELS[delivery]}
    </Badge>
  );
}
