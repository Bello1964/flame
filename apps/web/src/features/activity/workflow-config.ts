import {
  CheckCircle2,
  Eye,
  FilePen,
  Forward,
  LogOut,
  Send,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { OVERLAP_BLOCKED_CODE, type OverlapErrorDetails } from '@flame/shared';
import { ApiError } from '@/lib/api-client';
import type { TransitionAction } from './api';

export type WorkflowAction = TransitionAction | 'revise';

export interface ActionConfig {
  label: string;
  /** Shown while the request runs. */
  pending: string;
  done: string;
  icon: LucideIcon;
  tone: 'primary' | 'secondary' | 'destructive';
  /** Without a dialog the action runs straight away (only for easily undone steps). */
  dialog?: {
    title: string;
    description: string;
    comment: 'required' | 'optional';
    commentLabel: string;
    placeholder: string;
  };
}

export const ACTION_CONFIG: Record<WorkflowAction, ActionConfig> = {
  submit: {
    label: 'Submit for review',
    pending: 'Submitting…',
    done: 'Submitted for review.',
    icon: Send,
    tone: 'primary',
    dialog: {
      title: 'Submit this record for review?',
      description:
        'It can’t be edited while it is reviewed. Its current data-quality warnings are recorded with the submission and shown to the reviewer and approver.',
      comment: 'optional',
      commentLabel: 'Note for the reviewer',
      placeholder: 'e.g. Meter recalibrated on the 9th',
    },
  },
  recall: {
    label: 'Recall to draft',
    pending: 'Recalling…',
    done: 'Recalled to draft.',
    icon: Undo2,
    tone: 'secondary',
  },
  'start-review': {
    label: 'Start review',
    pending: 'Starting…',
    done: 'Review started. The record is assigned to you.',
    icon: Eye,
    tone: 'primary',
  },
  'release-claim': {
    label: 'Release review',
    pending: 'Releasing…',
    done: 'Review released. The record is back in the review queue.',
    icon: LogOut,
    tone: 'secondary',
    dialog: {
      title: 'Release this review?',
      description: 'The record goes back to the review queue for any eligible reviewer.',
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
      description:
        'You confirm you have reviewed the record. Someone other than you, who was not involved in it, must approve it.',
      comment: 'optional',
      commentLabel: 'Review note',
      placeholder: 'e.g. Checked against the daily meter log',
    },
  },
  return: {
    label: 'Return for correction',
    pending: 'Returning…',
    done: 'Returned for correction.',
    icon: Undo2,
    tone: 'secondary',
    dialog: {
      title: 'Return for correction?',
      description:
        'The record becomes editable again. Anyone who can enter activity data may correct and resubmit it.',
      comment: 'required',
      commentLabel: 'What needs correcting',
      placeholder: 'e.g. The rate looks ten times too high for this flare',
    },
  },
  approve: {
    label: 'Approve',
    pending: 'Approving…',
    done: 'Approved.',
    icon: CheckCircle2,
    tone: 'primary',
    dialog: {
      title: 'Approve this record?',
      description:
        'Approved records can’t be changed. A correction later needs a revision, which must be reviewed and approved again.',
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
      title: 'Reject this record?',
      description:
        'Rejection is final: the record is kept, read-only, and is not used. To record the activity differently, enter a new record.',
      comment: 'required',
      commentLabel: 'Reason',
      placeholder: 'e.g. This flare was shut in on that day',
    },
  },
  revise: {
    label: 'Revise',
    pending: 'Starting revision…',
    done: 'Revision started as a draft.',
    icon: FilePen,
    tone: 'secondary',
    dialog: {
      title: 'Start a revision?',
      description:
        'A new draft is created with this record’s values. This record stays approved, and in use, until the revision is approved; then it is marked superseded.',
      comment: 'optional',
      commentLabel: '',
      placeholder: '',
    },
  },
};

/** Overlapping records named by a 409 OVERLAP_BLOCKED, if that's what the error is. */
export function blockedOverlaps(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== OVERLAP_BLOCKED_CODE) return null;
  const details = error.details as Partial<OverlapErrorDetails> | undefined;
  return Array.isArray(details?.overlapping) ? details.overlapping : [];
}
