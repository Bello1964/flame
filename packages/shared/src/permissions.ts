import { ROLES, type Role } from './auth.js';

/**
 * The single permission matrix, shared by the API and the web app.
 *
 * - The API enforces it on every request (requirePermission). That is the control.
 * - The web app reads it only to decide which actions to offer. Hiding a button is
 *   not authorisation, and the API's answer is always authoritative.
 *
 * Extend per module; keep checks per operation rather than per page.
 * See docs/architecture/ARCHITECTURAL_WORKFLOW.md §6.
 */
export const PERMISSIONS = {
  'organisation:read': ROLES,
  'hierarchy:read': ROLES,
  'hierarchy:write': ['ORGANISATION_OWNER', 'ADMINISTRATOR'],
  // Default reference condition and other organisation-level settings.
  'organisation:settings': ['ORGANISATION_OWNER', 'ADMINISTRATOR'],
  'activity:read': ROLES,
  // Create, edit and withdraw draft activity records (ARCHITECTURAL_WORKFLOW.md §4.1).
  'activity:write': ['ORGANISATION_OWNER', 'ADMINISTRATOR', 'DATA_ENTRY_OFFICER'],
  // Review and approval (ARCHITECTURAL_WORKFLOW.md §7.1). Separation of duties is
  // enforced per record on top of these: anyone involved in a record can't review or
  // approve it, and its reviewer can't approve it.
  'activity:submit': ['ORGANISATION_OWNER', 'ADMINISTRATOR', 'DATA_ENTRY_OFFICER'],
  'activity:review': ['ORGANISATION_OWNER', 'REVIEWER'],
  'activity:approve': ['ORGANISATION_OWNER', 'APPROVER'],
  // Release another reviewer's claim. A reviewer can always release their own.
  'activity:release-claim': ['ORGANISATION_OWNER'],
  // Emissions calculations (ARCHITECTURAL_WORKFLOW.md §8.1), with the same separation of
  // duties: whoever ran or submitted a calculation can't review or approve it, and its
  // reviewer can't approve it.
  'calculation:read': ROLES,
  'calculation:run': ['ORGANISATION_OWNER', 'ADMINISTRATOR', 'DATA_ENTRY_OFFICER'],
  'calculation:review': ['ORGANISATION_OWNER', 'REVIEWER'],
  'calculation:approve': ['ORGANISATION_OWNER', 'APPROVER'],
  'calculation:release-claim': ['ORGANISATION_OWNER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** True when any of the member's roles grants the permission (roles combine as a union). */
export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}
