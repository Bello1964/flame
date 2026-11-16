import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ActivityAction, ActivityRecordDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useReviseActivity, useWorkflowAction } from './api';
import { ACTION_CONFIG, blockedOverlaps, type WorkflowAction } from './workflow-config';

/** Order of the buttons: decisions first, then the quieter options. */
const ORDER: WorkflowAction[] = [
  'submit',
  'start-review',
  'forward',
  'approve',
  'return',
  'reject',
  'recall',
  'release-claim',
  'revise',
];

export function ActionError({ error }: { error: unknown }) {
  const { organisationId } = useOrganisation();
  const overlaps = blockedOverlaps(error);
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p>{errorMessage(error)}</p>
        {overlaps && overlaps.length > 0 && (
          <ul className="text-foreground">
            {overlaps.map((o) => (
              <li key={o.id}>
                <Link
                  className="underline underline-offset-4"
                  to={`/o/${organisationId}/activity-records/${o.id}`}
                >
                  {o.periodStart === o.periodEnd
                    ? formatDate(o.periodStart)
                    : `${formatDate(o.periodStart)} – ${formatDate(o.periodEnd)}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The workflow steps this user may take on the record now, as listed by the API
 * (`availableActions`). The API checks again on every request; this only decides which
 * buttons to show.
 */
export function WorkflowActions({ record }: { record: ActivityRecordDto }) {
  const actions = ORDER.filter((a) => record.availableActions.includes(a as ActivityAction));
  const [open, setOpen] = useState<WorkflowAction | null>(null);
  const { organisationId } = useOrganisation();
  const transition = useWorkflowAction(organisationId, record.id);
  const revise = useReviseActivity(organisationId, record.id);
  const navigate = useNavigate();
  const busy = transition.isPending || revise.isPending;

  if (actions.length === 0) return null;

  const run = (action: WorkflowAction, comment?: string) => {
    const config = ACTION_CONFIG[action];
    if (action === 'revise') {
      revise.mutate(undefined, {
        onSuccess: (draft) => {
          toast.success(config.done);
          setOpen(null);
          void navigate(`/o/${organisationId}/activity-records/${draft.id}`);
        },
      });
      return;
    }
    transition.mutate(
      { action, ...(comment ? { comment } : {}) },
      {
        onSuccess: () => {
          toast.success(config.done);
          setOpen(null);
        },
      },
    );
  };

  const inlineError = open === null && transition.isError ? transition.error : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const config = ACTION_CONFIG[action];
          const Icon = config.icon;
          return (
            <Button
              key={action}
              variant={config.tone === 'primary' ? 'default' : 'outline'}
              className={
                config.tone === 'destructive'
                  ? 'text-destructive hover:text-destructive'
                  : undefined
              }
              disabled={busy}
              onClick={() => {
                transition.reset();
                revise.reset();
                if (config.dialog) setOpen(action);
                else run(action);
              }}
            >
              {busy && transition.variables?.action === action && !config.dialog ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Icon aria-hidden />
              )}
              {config.label}
            </Button>
          );
        })}
      </div>
      {inlineError !== null && <ActionError error={inlineError} />}
      {open !== null && (
        <ActionDialog
          action={open}
          pending={busy}
          error={open === 'revise' ? revise.error : transition.error}
          onCancel={() => {
            setOpen(null);
          }}
          onConfirm={(comment) => {
            run(open, comment);
          }}
        />
      )}
    </div>
  );
}

/** Confirmation with an optional or required comment, kept in the record history. */
export function ActionDialog({
  action,
  pending,
  error,
  onCancel,
  onConfirm,
  count,
}: {
  action: WorkflowAction;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: (comment: string | undefined) => void;
  /** For bulk actions: how many records the action applies to. */
  count?: number;
}) {
  const config = ACTION_CONFIG[action];
  const dialog = config.dialog;
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const commentId = useId();
  if (!dialog) return null;
  const required = dialog.comment === 'required';
  const missing = required && comment.trim() === '';
  const withComment = dialog.commentLabel !== '';

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === undefined
              ? dialog.title
              : `${config.label}: ${String(count)} record${count === 1 ? '' : 's'}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {withComment && (
          <div className="grid gap-1.5">
            <Label htmlFor={commentId}>
              {dialog.commentLabel}
              {required ? (
                <span className="text-destructive" aria-hidden>
                  {' '}
                  *
                </span>
              ) : (
                <span className="font-normal text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id={commentId}
              rows={3}
              value={comment}
              maxLength={2000}
              aria-required={required}
              aria-invalid={touched && missing}
              placeholder={dialog.placeholder}
              onChange={(e) => {
                setComment(e.target.value);
              }}
              onBlur={() => {
                setTouched(true);
              }}
            />
            {touched && missing && (
              <p className="text-xs font-medium text-destructive">Give a reason</p>
            )}
            <p className="text-xs text-muted-foreground">Kept in the record’s history.</p>
          </div>
        )}
        {error !== null && error !== undefined && <ActionError error={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={config.tone === 'destructive' ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => {
              setTouched(true);
              if (missing) return;
              onConfirm(comment.trim() || undefined);
            }}
          >
            {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {pending ? config.pending : config.label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
