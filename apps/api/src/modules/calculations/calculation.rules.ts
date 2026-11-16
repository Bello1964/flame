import { CALCULATION_ACTIONS, hasPermission, type CalculationAction } from '@flame/shared';
import type { CalculationStatus } from '../../generated/prisma/client.js';
import type { Refusal, Viewer } from '../workflow/workflow.rules.js';

/**
 * Review and approval rules for calculations (ARCHITECTURAL_WORKFLOW.md §8.1), the same
 * three-person rule as activity records: whoever ran or submitted a calculation can't
 * review or approve it, and its reviewer can't approve it. A rejected calculation is
 * final; a correction is a new calculation version.
 */

export interface CalculationInvolvement {
  /** Ran or submitted the calculation. */
  involved: Set<string>;
  /** Started a review of it. */
  reviewers: Set<string>;
}

export interface CalculationState {
  status: CalculationStatus;
  claimedById: string | null;
}

const LABEL: Record<CalculationStatus, string> = {
  CALCULATED: 'calculated but not submitted',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under review',
  AWAITING_APPROVAL: 'awaiting approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded',
  DISCARDED: 'discarded',
};

const INVOLVED =
  'You ran or submitted this calculation, so someone else must review and approve it';
const REVIEWER = 'You reviewed this calculation, so someone else must approve it';

export function calculationRefusal(
  action: CalculationAction,
  c: CalculationState,
  viewer: Viewer,
  inv: CalculationInvolvement,
): Refusal | null {
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(viewer.roles, p);
  const state = (message: string): Refusal => ({ kind: 'state', message });
  const current = `This calculation is ${LABEL[c.status]}`;

  switch (action) {
    case 'submit':
    case 'discard':
      if (!can('calculation:run')) return { kind: 'permission' };
      if (c.status !== 'CALCULATED') {
        return state(
          `${current}; only a new calculation can be ${action === 'submit' ? 'submitted' : 'discarded'}`,
        );
      }
      return null;
    case 'recall':
      if (!can('calculation:run')) return { kind: 'permission' };
      if (c.status !== 'SUBMITTED')
        return state(`${current}; it can only be recalled before its review starts`);
      if (!inv.involved.has(viewer.userId)) {
        return state('Only someone who ran or submitted this calculation can recall it');
      }
      return null;
    case 'start-review':
      if (!can('calculation:review')) return { kind: 'permission' };
      if (c.status !== 'SUBMITTED')
        return state(`${current}; only submitted calculations can be reviewed`);
      if (inv.involved.has(viewer.userId)) return { kind: 'separation', message: INVOLVED };
      return null;
    case 'release-claim':
      if (c.status !== 'UNDER_REVIEW') return state(`${current}; there is no review to release`);
      if (c.claimedById === viewer.userId && can('calculation:review')) return null;
      return can('calculation:release-claim') ? null : { kind: 'permission' };
    case 'forward':
      if (!can('calculation:review')) return { kind: 'permission' };
      if (c.status !== 'UNDER_REVIEW') return state(`${current}; start a review first`);
      if (c.claimedById !== viewer.userId)
        return state('Another reviewer is reviewing this calculation');
      return null;
    case 'reject':
      if (c.status === 'UNDER_REVIEW') {
        if (!can('calculation:review')) return { kind: 'permission' };
        if (c.claimedById !== viewer.userId)
          return state('Another reviewer is reviewing this calculation');
        return null;
      }
      if (c.status === 'AWAITING_APPROVAL')
        return approver(viewer, inv, can('calculation:approve'));
      if (!can('calculation:review') && !can('calculation:approve')) return { kind: 'permission' };
      return state(
        `${current}; only calculations under review or awaiting approval can be rejected`,
      );
    case 'approve':
      if (!can('calculation:approve')) return { kind: 'permission' };
      if (c.status !== 'AWAITING_APPROVAL')
        return state(`${current}; only calculations awaiting approval can be approved`);
      return approver(viewer, inv, true);
  }
}

function approver(viewer: Viewer, inv: CalculationInvolvement, permitted: boolean): Refusal | null {
  if (!permitted) return { kind: 'permission' };
  if (inv.involved.has(viewer.userId)) return { kind: 'separation', message: INVOLVED };
  if (inv.reviewers.has(viewer.userId)) return { kind: 'separation', message: REVIEWER };
  return null;
}

export function calculationActions(
  c: CalculationState,
  viewer: Viewer,
  inv: CalculationInvolvement,
): CalculationAction[] {
  return CALCULATION_ACTIONS.filter((a) => calculationRefusal(a, c, viewer, inv) === null);
}

export function calculationSeparationNote(
  c: CalculationState,
  viewer: Viewer,
  inv: CalculationInvolvement,
): string | null {
  for (const action of ['start-review', 'approve'] as const) {
    const r = calculationRefusal(action, c, viewer, inv);
    if (r?.kind === 'separation') return r.message;
  }
  return null;
}
