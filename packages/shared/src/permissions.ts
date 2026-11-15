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
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** True when any of the member's roles grants the permission (roles combine as a union). */
export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}
