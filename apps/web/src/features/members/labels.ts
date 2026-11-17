import {
  INVITATION_VALIDITY_DAYS,
  MEMBERSHIP_ERROR_CODES as CODES,
  ROLES,
  type EmailDeliveryStatus,
  type InvitationStatus,
  type MemberRemovalDto,
  type MembershipStatus,
  type Role,
} from '@flame/shared';
import { ApiError, errorMessage } from '@/lib/api-client';
import { ROLE_LABELS } from '@/features/organisations/permissions';

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REMOVED: 'Removed',
};

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

export const DELIVERY_LABELS: Record<EmailDeliveryStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  FAILED: 'Not delivered',
  CANCELLED: 'Cancelled',
};

export const DELIVERY_DESCRIPTIONS: Record<EmailDeliveryStatus, string> = {
  QUEUED: 'The email is waiting to be sent.',
  SENT: 'The email was sent.',
  FAILED: 'The email could not be delivered. Revoke this invitation and invite again.',
  CANCELLED: 'The email was not sent because the invitation was answered or revoked first.',
};

/** Roles in the canonical order, as plain words: "Owner, Reviewer". */
export function roleList(roles: readonly Role[]): string {
  return ROLES.filter((r) => roles.includes(r))
    .map((r) => ROLE_LABELS[r])
    .join(', ');
}

/** Shown wherever invitations are sent or listed. */
export const INVITATION_RULES = `Invitation links are valid for ${String(INVITATION_VALIDITY_DAYS)} days and work once. They can’t be re-sent: to send a new link, revoke the pending invitation and invite again.`;

const MESSAGES: Record<string, string> = {
  [CODES.SELF_CHANGE]:
    'You can’t change your own roles or suspend or remove yourself. Ask another Owner or Administrator.',
  [CODES.OWNER_ONLY]: 'Only an Owner can grant the Owner role.',
  [CODES.ALREADY_MEMBER]: 'This person is already a member of the organisation.',
  [CODES.MEMBER_SUSPENDED]:
    'This person is a suspended member. Reinstate them from the members list instead of inviting them.',
  [CODES.INVITATION_PENDING]:
    'A valid invitation has already been sent to this email. Invitations can’t be re-sent: revoke the pending invitation, then invite again to send a new link.',
  [CODES.INVITATION_EXPIRED]: 'This invitation has expired.',
  [CODES.INVITATION_NOT_PENDING]: 'This invitation has already been accepted, declined or revoked.',
  [CODES.ALREADY_PLATFORM_ADMIN]: 'This person is already a Platform Administrator.',
  [CODES.SUPREME_ADMIN_REQUIRED]:
    'Only the supreme Platform Administrator can remove administration rights.',
  [CODES.SUPREME_ADMIN_PROTECTED]: 'The supreme Platform Administrator can’t be removed.',
  [CODES.ORGANISATION_HAS_OWNER]:
    'This organisation already has an active Owner, who manages its members.',
  [CODES.ORGANISATION_NOT_DORMANT]:
    'This organisation has an Owner again, so this invitation can no longer be used. Ask its Owner for a new invitation.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
};

/** A human message for membership, invitation and platform-administration errors. */
export function membershipErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = MESSAGES[error.code];
    if (message) return message;
    if (error.status === 403 && error.code === 'FORBIDDEN') {
      return 'Your role doesn’t allow this. Ask an Owner or Administrator.';
    }
  }
  return errorMessage(error);
}

/** "Released 2 activity record claims and 1 calculation claim." or null when none. */
export function releasedClaimsText(result: MemberRemovalDto): string | null {
  const { activityRecords, calculations } = result.releasedClaims;
  const parts: string[] = [];
  if (activityRecords > 0) {
    parts.push(
      `${String(activityRecords)} activity record ${activityRecords === 1 ? 'claim' : 'claims'}`,
    );
  }
  if (calculations > 0) {
    parts.push(`${String(calculations)} calculation ${calculations === 1 ? 'claim' : 'claims'}`);
  }
  return parts.length > 0 ? `Released ${parts.join(' and ')} back to Submitted.` : null;
}
