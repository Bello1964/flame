import { hasPermission, type Role } from '@carbon/shared';

/**
 * Uses the same permission matrix the API enforces (@carbon/shared), so the interface
 * offers exactly the actions the user's roles allow. This is a display aid, not a
 * control: the API checks every request and its answer is authoritative.
 */
export function canWriteHierarchy(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'hierarchy:write');
}

export function canWriteActivity(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'activity:write');
}

export function canManageSettings(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'organisation:settings');
}

export const ROLE_LABELS: Record<Role, string> = {
  ORGANISATION_OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
  APPROVER: 'Approver',
  REVIEWER: 'Reviewer',
  DATA_ENTRY_OFFICER: 'Data entry officer',
  VIEWER: 'Viewer',
};
