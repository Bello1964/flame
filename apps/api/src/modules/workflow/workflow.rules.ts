import { hasPermission, type ActivityAction, type Role } from '@flame/shared';
import type { ActivityRecordStatus } from '../../generated/prisma/client.js';
import type { Involvement } from '../activity/activity.repository.js';

/**
 * Review and approval rules for activity records (ARCHITECTURAL_WORKFLOW.md §7.1).
 * Pure functions: the service applies them inside a transaction with the record locked,
 * and the read path uses them to tell the client which actions to offer.
 */

export interface Viewer {
  userId: string;
  roles: readonly Role[];
}

export interface RecordState {
  status: ActivityRecordStatus;
  claimedById: string | null;
  /** The flare source is ACTIVE (not archived). */
  sourceActive: boolean;
  /** An open revision of this record exists. */
  hasOpenRevision: boolean;
}

const EDITABLE: ActivityRecordStatus[] = ['DRAFT', 'NEEDS_CORRECTION'];

export type Refusal =
  | { kind: 'permission' }
  | { kind: 'state'; message: string }
  | { kind: 'separation'; message: string };

const STATUS_LABEL: Record<ActivityRecordStatus, string> = {
  DRAFT: 'a draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under review',
  NEEDS_CORRECTION: 'returned for correction',
  AWAITING_APPROVAL: 'awaiting approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded',
  WITHDRAWN: 'withdrawn',
};

export function statusLabel(status: ActivityRecordStatus): string {
  return STATUS_LABEL[status];
}

const INVOLVED_MESSAGE =
  'You entered, edited or submitted this record, so someone else must review and approve it';
const REVIEWER_MESSAGE = 'You reviewed this record, so someone else must approve it';

function state(message: string): Refusal {
  return { kind: 'state', message };
}

/**
 * Why `viewer` may not take `action` on the record now, or null when they may.
 * Order: role permission, then record state, then separation of duties.
 */
export function refusalFor(
  action: ActivityAction,
  r: RecordState,
  viewer: Viewer,
  inv: Involvement,
): Refusal | null {
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(viewer.roles, p);
  const is = (...statuses: ActivityRecordStatus[]) => statuses.includes(r.status);
  const current = `This record is ${statusLabel(r.status)}`;
  const involved = inv.involved.has(viewer.userId);

  switch (action) {
    case 'edit':
    case 'withdraw':
      if (!can('activity:write')) return { kind: 'permission' };
      if (!EDITABLE.includes(r.status)) {
        return state(
          `${current}; only drafts and records returned for correction can be ${action === 'edit' ? 'edited' : 'withdrawn'}`,
        );
      }
      if (action === 'edit' && !r.sourceActive) {
        return state('The flare source is archived, so its activity records are read-only');
      }
      return null;

    case 'submit':
      if (!can('activity:submit')) return { kind: 'permission' };
      if (!EDITABLE.includes(r.status)) {
        return state(
          `${current}; only drafts and records returned for correction can be submitted`,
        );
      }
      if (!r.sourceActive) {
        return state("The flare source is archived, so its records can't be submitted");
      }
      return null;

    case 'recall':
      if (!can('activity:submit')) return { kind: 'permission' };
      if (!is('SUBMITTED')) {
        return state(`${current}; a record can only be recalled before its review starts`);
      }
      if (!involved) {
        return state('Only someone who entered, edited or submitted this record can recall it');
      }
      return null;

    case 'start-review':
      if (!can('activity:review')) return { kind: 'permission' };
      if (!is('SUBMITTED')) return state(`${current}; only submitted records can be reviewed`);
      if (involved) return { kind: 'separation', message: INVOLVED_MESSAGE };
      return null;

    case 'release-claim':
      if (!is('UNDER_REVIEW')) return state(`${current}; there is no review to release`);
      if (r.claimedById === viewer.userId && can('activity:review')) return null;
      if (!can('activity:release-claim')) return { kind: 'permission' };
      return null;

    case 'forward':
      if (!can('activity:review')) return { kind: 'permission' };
      if (!is('UNDER_REVIEW')) return state(`${current}; start a review first`);
      if (r.claimedById !== viewer.userId)
        return state('Another reviewer is reviewing this record');
      return null;

    case 'return':
      if (is('UNDER_REVIEW')) {
        if (!can('activity:review')) return { kind: 'permission' };
        if (r.claimedById !== viewer.userId) {
          return state('Another reviewer is reviewing this record');
        }
        return null;
      }
      if (is('AWAITING_APPROVAL')) return approverRefusal(viewer, inv, can('activity:approve'));
      if (!can('activity:review') && !can('activity:approve')) return { kind: 'permission' };
      return state(`${current}; only records under review or awaiting approval can be returned`);

    case 'approve':
    case 'reject':
      if (!can('activity:approve')) return { kind: 'permission' };
      if (!is('AWAITING_APPROVAL')) {
        return state(`${current}; only records awaiting approval can be ${action}d`);
      }
      return approverRefusal(viewer, inv, true);

    case 'revise':
      if (!can('activity:write')) return { kind: 'permission' };
      if (!is('APPROVED')) return state(`${current}; only approved records can be revised`);
      if (r.hasOpenRevision) return state('This record already has a revision in progress');
      if (!r.sourceActive) {
        return state("The flare source is archived, so its records can't be revised");
      }
      return null;
  }
}

function approverRefusal(viewer: Viewer, inv: Involvement, permitted: boolean): Refusal | null {
  if (!permitted) return { kind: 'permission' };
  if (inv.involved.has(viewer.userId)) return { kind: 'separation', message: INVOLVED_MESSAGE };
  if (inv.reviewers.has(viewer.userId)) return { kind: 'separation', message: REVIEWER_MESSAGE };
  return null;
}

const ALL_ACTIONS: ActivityAction[] = [
  'edit',
  'withdraw',
  'submit',
  'recall',
  'start-review',
  'release-claim',
  'forward',
  'return',
  'approve',
  'reject',
  'revise',
];

/** The actions `viewer` may take on the record now. */
export function availableActions(
  r: RecordState,
  viewer: Viewer,
  inv: Involvement,
): ActivityAction[] {
  return ALL_ACTIONS.filter((a) => refusalFor(a, r, viewer, inv) === null);
}

/**
 * A note for a viewer whose role would let them review or approve this record but who
 * may not, because of separation of duties. Null otherwise.
 */
export function separationNote(r: RecordState, viewer: Viewer, inv: Involvement): string | null {
  const actions: ActivityAction[] = ['start-review', 'approve'];
  for (const action of actions) {
    const refusal = refusalFor(action, r, viewer, inv);
    if (refusal?.kind === 'separation') return refusal.message;
  }
  return null;
}
