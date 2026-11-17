import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '@flame/shared';
import { canGrantOwner, canManageMembers, canReadMembers, canWriteHierarchy } from './permissions';

describe('canWriteHierarchy (shared permission matrix)', () => {
  const writers: Role[] = ['ORGANISATION_OWNER', 'ADMINISTRATOR'];

  it.each(ROLES)('%s', (role) => {
    expect(canWriteHierarchy([role])).toBe(writers.includes(role));
  });

  it('combines several roles as a union', () => {
    expect(canWriteHierarchy(['VIEWER', 'ADMINISTRATOR'])).toBe(true);
    expect(canWriteHierarchy([])).toBe(false);
  });
});

describe('member management (shared permission matrix)', () => {
  const managers: Role[] = ['ORGANISATION_OWNER', 'ADMINISTRATOR'];

  it.each(ROLES)('%s', (role) => {
    expect(canReadMembers([role])).toBe(managers.includes(role));
    expect(canManageMembers([role])).toBe(managers.includes(role));
  });

  it('lets only an Owner grant the Owner role', () => {
    expect(canGrantOwner(['ORGANISATION_OWNER'])).toBe(true);
    expect(canGrantOwner(['ADMINISTRATOR', 'APPROVER'])).toBe(false);
  });
});
