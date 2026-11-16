import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '@flame/shared';
import { canWriteHierarchy } from './permissions';

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
