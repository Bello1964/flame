import { Ban, CheckCircle2, Eye, Forward, LogOut, Send, Undo2, XCircle } from 'lucide-react';
import {
  CALCULATION_BLOCKED_CODE,
  type CalculationAction,
  type CalculationBlockedDetails,
} from '@flame/shared';
import { ApiError } from '@/lib/api-client';
import type { ActionConfig } from '@/features/activity/workflow-config';

/** Wording for each calculation step; the API decides who may take it. */
export const CALCULATION_ACTION_CONFIG: Record<CalculationAction, ActionConfig> = {
  submit: {
    label: 'Submit for review',
    pending: 'Submitting…',
    done: 'Submitted for review.',
    icon: Send,
    tone: 'primary',
    dialog: {
      title: 'Submit this calculation for review?',
      description:
        'A reviewer checks the inputs and trace; someone else then approves it. The result can’t change.',
      comment: 'optional',
      commentLabel: 'Note for the reviewer',
      placeholder: 'Optional',
    },
  },
  recall: {
    label: 'Recall',
    pending: 'Recalling…',
    done: 'Recalled.',
    icon: Undo2,
    tone: 'secondary',
  },
  discard: {
    label: 'Discard',
    pending: 'Discarding…',
    done: 'Discarded.',
    icon: Ban,
    tone: 'destructive',
    dialog: {
      title: 'Discard this calculation?',
      description: 'It is kept in the history, read-only, and the record can be calculated again.',
      comment: 'required',
      commentLabel: 'Reason',
      placeholder: 'e.g. Ran with the wrong route',
    },
  },
  'start-review': {
    label: 'Start review',
    pending: 'Starting…',
    done: 'Review started. The calculation is assigned to you.',
    icon: Eye,
    tone: 'primary',
  },
  'release-claim': {
    label: 'Release review',
    pending: 'Releasing…',
    done: 'Review released.',
    icon: LogOut,
    tone: 'secondary',
    dialog: {
      title: 'Release this review?',
      description: 'The calculation goes back to the queue for any eligible reviewer.',
      comment: 'required',
      commentLabel: 'Reason',
      placeholder: 'e.g. On leave this week',
    },
  },
  forward: {
    label: 'Forward for approval',
    pending: 'Forwarding…',
    done: 'Forwarded for approval.',
    icon: Forward,
    tone: 'primary',
    dialog: {
      title: 'Forward for approval?',
      description: 'You confirm you have checked the inputs, the route and the step-by-step trace.',
      comment: 'optional',
      commentLabel: 'Review note',
      placeholder: 'Optional',
    },
  },
  approve: {
    label: 'Approve',
    pending: 'Approving…',
    done: 'Approved.',
    icon: CheckCircle2,
    tone: 'primary',
    dialog: {
      title: 'Approve this calculation?',
      description:
        'It becomes the approved result for this activity record (replacing any earlier approved version). Approved results never change; a correction is a new calculation.',
      comment: 'optional',
      commentLabel: 'Approval note',
      placeholder: 'Optional',
    },
  },
  reject: {
    label: 'Reject',
    pending: 'Rejecting…',
    done: 'Rejected.',
    icon: XCircle,
    tone: 'destructive',
    dialog: {
      title: 'Reject this calculation?',
      description:
        'Rejection is final. Fix the inputs and run a new calculation; the reason is kept in the history.',
      comment: 'required',
      commentLabel: 'Reason',
      placeholder: 'e.g. The gas analysis is from the wrong separator',
    },
  },
};

export const CALCULATION_ACTION_ORDER: CalculationAction[] = [
  'submit',
  'start-review',
  'forward',
  'approve',
  'reject',
  'recall',
  'release-claim',
  'discard',
];

/** The inputs a refused calculation still needs, in words. */
export function missingInputs(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== CALCULATION_BLOCKED_CODE) return null;
  const details = error.details as Partial<CalculationBlockedDetails> | undefined;
  return Array.isArray(details?.missing) ? details.missing : [];
}
