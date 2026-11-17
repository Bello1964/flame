export const ROLES = [
  'ORGANISATION_OWNER',
  'ADMINISTRATOR',
  'APPROVER',
  'REVIEWER',
  'DATA_ENTRY_OFFICER',
  'VIEWER',
] as const;

export type Role = (typeof ROLES)[number];

export interface MembershipSummary {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  roles: Role[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

/** Returned by POST /auth/login and GET /auth/session. */
export interface SessionResponse {
  user: CurrentUser;
  memberships: MembershipSummary[];
  /** Send as the X-CSRF-Token header on every state-changing request. */
  csrfToken: string;
}

export const CSRF_HEADER = 'x-csrf-token';

// ─── Password reset and account (ARCHITECTURAL_WORKFLOW.md §7.3) ─────────────

/** Bounds for a new password (invitations, reset, change). */
export const NEW_PASSWORD_MIN = 12;
export const NEW_PASSWORD_MAX = 256;
/** How long a password reset link stays valid. */
export const PASSWORD_RESET_VALIDITY_MINUTES = 15;

/**
 * POST /auth/password-reset/request (public). Always answered with 202 and the same body,
 * whether or not the email belongs to an account that can reset its password.
 */
export interface PasswordResetRequest {
  email: string;
}

/** POST /auth/password-reset/complete (public). 204 on success; every session is signed out. */
export interface PasswordResetCompleteRequest {
  token: string;
  password: string;
}

/** POST /account/password (signed in). 204; other sessions are signed out, this one stays. */
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

/** PATCH /account (signed in). Returns the updated CurrentUser. */
export interface AccountUpdateRequest {
  name: string;
}

export const ACCOUNT_ERROR_CODES = {
  /** 400: the reset link is unknown, used, replaced or expired, or the account is disabled. */
  PASSWORD_RESET_INVALID: 'PASSWORD_RESET_INVALID',
} as const;
