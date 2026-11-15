import type { Role } from '../../generated/prisma/client.js';

const ALL_ROLES: readonly Role[] = [
  'ORGANISATION_OWNER',
  'ADMINISTRATOR',
  'APPROVER',
  'REVIEWER',
  'DATA_ENTRY_OFFICER',
  'VIEWER',
];

/**
 * Initial permission matrix (Milestone 1). Extend per module; keep checks
 * per operation rather than per page. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §6.
 */
export const PERMISSIONS = {
  'organisation:read': ALL_ROLES,
  'hierarchy:read': ALL_ROLES,
  'hierarchy:write': ['ORGANISATION_OWNER', 'ADMINISTRATOR'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}
