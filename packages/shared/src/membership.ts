import type { Role } from './auth.js';

/**
 * Membership management, invitations and platform administration (Milestone 6).
 * Rules: docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.2.
 */

// ─── Organisation ────────────────────────────────────────────────────────────

/** GET /organisations/:organisationId (`organisation:read`). */
export interface OrganisationDto {
  id: string;
  name: string;
  slug: string;
  country: string;
  /** The requesting member's roles. */
  roles: Role[];
  /**
   * No ACTIVE member holds the Owner role. Members carry on as before; only a Platform
   * Administrator can invite a new Owner.
   */
  dormant: boolean;
}

// ─── Members ─────────────────────────────────────────────────────────────────

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** GET /organisations/:organisationId/members (`members:read`). */
export interface MemberDto {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  status: MembershipStatus;
  /** When the membership was first created. */
  joinedAt: string;
  updatedAt: string;
  /** The requesting user's own membership (which they can't change). */
  isSelf: boolean;
}

/** Query for GET …/members. REMOVED members are left out unless `includeRemoved=true`. */
export interface MemberListQuery {
  includeRemoved?: 'true' | 'false';
}

/** PATCH /organisations/:organisationId/members/:membershipId (`members:manage`). */
export interface MemberRolesUpdate {
  roles: Role[];
}

/** POST …/members/:membershipId/{suspend,reinstate,remove} (`members:manage`). */
export const MEMBER_ACTIONS = ['suspend', 'reinstate', 'remove'] as const;
export type MemberAction = (typeof MEMBER_ACTIONS)[number];

/** Returned by POST …/members/:membershipId/remove. */
export interface MemberRemovalDto {
  member: MemberDto;
  /** Review claims the member held in this organisation, released back to Submitted. */
  releasedClaims: { activityRecords: number; calculations: number };
  /** True when the account had no other membership and was disabled. */
  accountDisabled: boolean;
}

// ─── Invitations ─────────────────────────────────────────────────────────────

/** Invitation links stay valid for this many days. */
export const INVITATION_VALIDITY_DAYS = 5;

export const INVITATION_KINDS = ['ORGANISATION', 'PLATFORM_ADMIN'] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

/** A PENDING invitation past its expiry is always reported as EXPIRED. */
export const INVITATION_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'REVOKED',
  'EXPIRED',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Delivery of the invitation email: queued (or being sent), sent, failed for good, or
 * cancelled before sending because the invitation was revoked, declined or accepted.
 */
export const EMAIL_DELIVERY_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export interface InvitationDto {
  id: string;
  kind: InvitationKind;
  /** Null for Platform Administrator invitations. */
  organisationId: string | null;
  email: string;
  /** Empty for Platform Administrator invitations. */
  roles: Role[];
  status: InvitationStatus;
  invitedBy: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  /** When it was accepted or declined. */
  respondedAt: string | null;
  revokedAt: string | null;
  /** Null when no email was queued for it. */
  delivery: EmailDeliveryStatus | null;
}

/** POST /organisations/:organisationId/invitations (`members:manage`). */
export interface InvitationCreate {
  email: string;
  roles: Role[];
}

/** POST /invitations/lookup and /invitations/decline (public). */
export interface InvitationTokenRequest {
  token: string;
}

/**
 * POST /invitations/accept (public).
 * - No account for the invited email: `name` (1–200) and `password` (12–256) are required;
 *   the account is created and signed in.
 * - An account exists: either be signed in as the invited email, or send that account's
 *   `password` (this also re-enables a disabled account); a new session is then opened.
 */
export interface InvitationAcceptRequest {
  token: string;
  name?: string;
  password?: string;
}

/** Returned by POST /invitations/lookup. */
export interface InvitationLookupDto {
  kind: InvitationKind;
  /** The organisation to open once accepted; null for a Platform Administrator invitation. */
  organisationId: string | null;
  organisationName: string | null;
  inviterName: string;
  email: string;
  roles: Role[];
  expiresAt: string;
  status: InvitationStatus;
  /** Whether an account already exists for the invited email. */
  accountExists: boolean;
}

// ─── Platform administration ─────────────────────────────────────────────────

/** GET /admin/organisations (Platform Administrators). No tenant operational data. */
export interface PlatformOrganisationDto {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  activeMemberCount: number;
  hasActiveOwner: boolean;
  /** No ACTIVE member holds the Owner role (always `!hasActiveOwner`). */
  dormant: boolean;
  /** The pending (not expired) Owner invitation of a dormant organisation, if any. */
  pendingOwnerInvitation: InvitationDto | null;
}

/** POST /admin/organisations. `country` is ISO 3166-1 alpha-2 (default NG). */
export interface PlatformOrganisationCreate {
  name: string;
  country?: string;
  ownerEmail: string;
}

/** POST /admin/organisations/:organisationId/owner-invitation (no active Owner yet). */
export interface OwnerInvitationCreate {
  email: string;
}

export interface PlatformAdminDto {
  userId: string;
  name: string;
  email: string;
  isSupremeAdmin: boolean;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

/** GET /admin/platform-admins. */
export interface PlatformAdminsDto {
  administrators: PlatformAdminDto[];
  /** Pending (not expired) Platform Administrator invitations. */
  invitations: InvitationDto[];
  /** Only the supreme administrator may remove administration rights. */
  viewerIsSupremeAdmin: boolean;
}

/** POST /admin/platform-admins/invitations. */
export interface PlatformAdminInvitationCreate {
  email: string;
}

/** Returned by POST /admin/platform-admins/:userId/remove. */
export interface PlatformAdminRemovalDto {
  userId: string;
  accountDisabled: boolean;
}

// ─── Development mailbox ─────────────────────────────────────────────────────

/** GET /dev/mailbox (only mounted when NODE_ENV=development). */
export interface DevMailboxEmailDto {
  id: string;
  to: string;
  template: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  subject: string;
  text: string;
  html: string;
}

// ─── Error codes ─────────────────────────────────────────────────────────────

export const MEMBERSHIP_ERROR_CODES = {
  /** 403: nobody may change their own roles or suspend or remove themselves. */
  SELF_CHANGE: 'SELF_MEMBERSHIP_CHANGE',
  /** 403: only an Owner may grant the Owner role (by role change or invitation). */
  OWNER_ONLY: 'OWNER_ONLY',
  /** 409: the email already belongs to an active member. */
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  /** 409: the email belongs to a suspended member; reinstate them instead. */
  MEMBER_SUSPENDED: 'MEMBER_SUSPENDED',
  /** 409: a valid invitation already exists for this email; revoke it first. */
  INVITATION_PENDING: 'INVITATION_PENDING',
  /** 409: the invitation has expired. */
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  /** 409: the invitation was already accepted, declined or revoked. */
  INVITATION_NOT_PENDING: 'INVITATION_NOT_PENDING',
  /** 403: an account exists for the invited email; sign in as it (or give its password). */
  INVITATION_SIGN_IN_REQUIRED: 'INVITATION_SIGN_IN_REQUIRED',
  /** 403: signed in as a different account from the invited email. */
  INVITATION_WRONG_ACCOUNT: 'INVITATION_WRONG_ACCOUNT',
  /** 409: the user is already a Platform Administrator. */
  ALREADY_PLATFORM_ADMIN: 'ALREADY_PLATFORM_ADMIN',
  /** 403: only the supreme Platform Administrator may remove administration rights. */
  SUPREME_ADMIN_REQUIRED: 'SUPREME_ADMIN_REQUIRED',
  /** 409: the supreme Platform Administrator cannot be removed. */
  SUPREME_ADMIN_PROTECTED: 'SUPREME_ADMIN_PROTECTED',
  /** 409: the organisation already has an active Owner. */
  ORGANISATION_HAS_OWNER: 'ORGANISATION_HAS_OWNER',
  /**
   * 409: a Platform Administrator's Owner invitation can only be accepted while the
   * organisation is dormant; it has an active Owner again.
   */
  ORGANISATION_NOT_DORMANT: 'ORGANISATION_NOT_DORMANT',
} as const;
