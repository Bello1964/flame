import { describe, expect, it } from 'vitest';
import type { Role } from '@flame/shared';
import {
  availableActions,
  refusalFor,
  separationNote,
  type RecordState,
} from './workflow.rules.js';

const none = { involved: new Set<string>(), reviewers: new Set<string>() };
const viewer = (roles: Role[], userId = 'u1') => ({ userId, roles });
const record = (overrides: Partial<RecordState> = {}): RecordState => ({
  status: 'DRAFT',
  claimedById: null,
  sourceActive: true,
  hasOpenRevision: false,
  ...overrides,
});

describe('workflow rules', () => {
  it('keeps drafts on an archived flare source withdrawable but not editable or submittable', () => {
    const actions = availableActions(
      record({ sourceActive: false }),
      viewer(['DATA_ENTRY_OFFICER']),
      none,
    );
    expect(actions).toEqual(['withdraw']);
  });

  it('lets a reviewer who lost the reviewer role no longer forward their claim', () => {
    const state = record({ status: 'UNDER_REVIEW', claimedById: 'u1' });
    expect(refusalFor('forward', state, viewer(['VIEWER']), none)).toEqual({ kind: 'permission' });
    expect(refusalFor('release-claim', state, viewer(['VIEWER']), none)).toEqual({
      kind: 'permission',
    });
  });

  it('requires the approve permission to return a record awaiting approval', () => {
    const state = record({ status: 'AWAITING_APPROVAL' });
    expect(refusalFor('return', state, viewer(['REVIEWER']), none)).toEqual({
      kind: 'permission',
    });
    expect(refusalFor('return', state, viewer(['APPROVER']), none)).toBeNull();
  });

  it('applies separation of duties to returns at the approval stage too', () => {
    const state = record({ status: 'AWAITING_APPROVAL' });
    const reviewed = { involved: new Set<string>(), reviewers: new Set(['u1']) };
    expect(refusalFor('return', state, viewer(['APPROVER']), reviewed)?.kind).toBe('separation');
  });

  it('offers no revision while one is open or the flare source is archived', () => {
    const approved = record({ status: 'APPROVED' });
    expect(availableActions(approved, viewer(['DATA_ENTRY_OFFICER']), none)).toEqual(['revise']);
    expect(
      availableActions(
        { ...approved, hasOpenRevision: true },
        viewer(['DATA_ENTRY_OFFICER']),
        none,
      ),
    ).toEqual([]);
    expect(
      availableActions({ ...approved, sourceActive: false }, viewer(['DATA_ENTRY_OFFICER']), none),
    ).toEqual([]);
  });

  it('explains separation of duties only to people whose role would allow the step', () => {
    const submitted = record({ status: 'SUBMITTED' });
    const involved = { involved: new Set(['u1']), reviewers: new Set<string>() };
    expect(separationNote(submitted, viewer(['REVIEWER']), involved)).toMatch(/someone else/);
    expect(separationNote(submitted, viewer(['DATA_ENTRY_OFFICER']), involved)).toBeNull();
  });
});
