import { hasPermission, type Role } from '@flame/shared';

/**
 * Uses the same permission matrix the API enforces (@flame/shared), so the interface
 * offers exactly the actions the user's roles allow. This is a display aid, not a
 * control: the API checks every request and its answer is authoritative.
 */
export function canWriteHierarchy(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'hierarchy:write');
}

export function canWriteActivity(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'activity:write');
}

export function canReviewActivity(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'activity:review');
}

export function canApproveActivity(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'activity:approve');
}

export function canRunCalculation(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'calculation:run');
}

export function canReviewCalculation(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'calculation:review');
}

export function canApproveCalculation(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'calculation:approve');
}

export function canManageSettings(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'organisation:settings');
}

export function canReadMembers(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'members:read');
}

export function canManageMembers(roles: readonly Role[]): boolean {
  return hasPermission(roles, 'members:manage');
}

/** Only an Owner may grant the Owner role (ARCHITECTURAL_WORKFLOW.md §7.2). */
export function canGrantOwner(roles: readonly Role[]): boolean {
  return roles.includes('ORGANISATION_OWNER');
}

export const ROLE_LABELS: Record<Role, string> = {
  ORGANISATION_OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
  APPROVER: 'Approver',
  REVIEWER: 'Reviewer',
  DATA_ENTRY_OFFICER: 'Data entry officer',
  VIEWER: 'Viewer',
};
