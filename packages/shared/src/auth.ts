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
