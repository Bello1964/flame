import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, GitBranch, History, Info, Undo2, XCircle } from 'lucide-react';
import type { ActivityEventType, ActivityRecordDto } from '@flame/shared';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useActivityHistory } from './api';

function Notice({
  icon,
  tone = 'neutral',
  children,
}: {
  icon: ReactNode;
  tone?: 'neutral' | 'pending' | 'attention' | 'done' | 'stopped';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        tone === 'neutral' && 'bg-card',
        tone === 'pending' && 'border-pending/35 bg-pending/6 [&>svg]:text-pending',
        tone === 'attention' && 'border-warning/45 bg-warning/8 [&>svg]:text-warning',
        tone === 'done' && 'border-success/35 bg-success/6 [&>svg]:text-success',
        tone === 'stopped' && 'border-destructive/30 bg-destructive/5 [&>svg]:text-destructive',
      )}
    >
      {icon}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/** The latest comment left with a given step (e.g. why it was returned). */
function useLatestComment(orgId: string, recordId: string, type: ActivityEventType, on: boolean) {
  const history = useActivityHistory(orgId, recordId);
  if (!on || !history.data) return null;
  const event = history.data.findLast((e) => e.type === type);
  return event ? { comment: event.comment, by: event.actor.name, at: event.createdAt } : null;
}

/**
 * Where the record stands in the review workflow, who holds it, and links between a
 * record and its revisions. Status is always said in words, not only by colour.
 */
export function WorkflowNotice({ record: r }: { record: ActivityRecordDto }) {
  const { organisationId } = useOrganisation();
  const link = (id: string) => `/o/${organisationId}/activity-records/${id}`;
  const returned = useLatestComment(
    organisationId,
    r.id,
    'RETURNED',
    r.status === 'NEEDS_CORRECTION',
  );
  const rejected = useLatestComment(organisationId, r.id, 'REJECTED', r.status === 'REJECTED');

  const notices: ReactNode[] = [];

  if (r.revisionOfId) {
    notices.push(
      <Notice key="revision" icon={<GitBranch aria-hidden />}>
        <p>
          Version {r.version}: a revision of an approved record, which stays in use until this
          revision is approved.{' '}
          <Link className="text-primary underline underline-offset-4" to={link(r.revisionOfId)}>
            Open the record it revises
          </Link>
        </p>
      </Notice>,
    );
  }

  switch (r.status) {
    case 'SUBMITTED':
      notices.push(
        <Notice key="status" tone="pending" icon={<Info aria-hidden />}>
          <p>
            Waiting for a reviewer
            {r.submittedAt ? ` since ${formatDateTime(r.submittedAt)}` : ''}. Values are locked.
          </p>
        </Notice>,
      );
      break;
    case 'UNDER_REVIEW':
      notices.push(
        <Notice key="status" tone="pending" icon={<Info aria-hidden />}>
          <p>
            Being reviewed by {r.claim?.byName ?? 'a reviewer'}
            {r.claim ? ` since ${formatDateTime(r.claim.at)}` : ''}. Values are locked.
          </p>
        </Notice>,
      );
      break;
    case 'AWAITING_APPROVAL':
      notices.push(
        <Notice key="status" tone="pending" icon={<Info aria-hidden />}>
          <p>Reviewed and waiting for approval. Values are locked.</p>
        </Notice>,
      );
      break;
    case 'NEEDS_CORRECTION':
      notices.push(
        <Notice key="status" tone="attention" icon={<Undo2 aria-hidden />}>
          <p className="font-medium">Returned for correction</p>
          {returned && (
            <p>
              “{returned.comment}” — {returned.by}, {formatDateTime(returned.at)}
            </p>
          )}
          <p className="text-muted-foreground">Edit the record, then submit it again.</p>
        </Notice>,
      );
      break;
    case 'APPROVED':
      notices.push(
        <Notice key="status" tone="done" icon={<CheckCircle2 aria-hidden />}>
          <p>
            Approved
            {r.approval ? ` by ${r.approval.byName} on ${formatDateTime(r.approval.at)}` : ''}. The
            values can’t be changed; a correction needs a revision.
          </p>
          {r.openRevisionId && (
            <p>
              A revision is in progress.{' '}
              <Link
                className="text-primary underline underline-offset-4"
                to={link(r.openRevisionId)}
              >
                Open the revision
              </Link>
            </p>
          )}
        </Notice>,
      );
      break;
    case 'SUPERSEDED':
      notices.push(
        <Notice key="status" icon={<History aria-hidden />}>
          <p>
            Superseded{r.supersededAt ? ` on ${formatDateTime(r.supersededAt)}` : ''} by an approved
            revision. Kept for history; no longer used.
            {r.supersededById && (
              <>
                {' '}
                <Link
                  className="text-primary underline underline-offset-4"
                  to={link(r.supersededById)}
                >
                  Open the revision that replaced it
                </Link>
              </>
            )}
          </p>
        </Notice>,
      );
      break;
    case 'REJECTED':
      notices.push(
        <Notice key="status" tone="stopped" icon={<XCircle aria-hidden />}>
          <p className="font-medium">Rejected. Kept for history; not used.</p>
          {rejected && (
            <p>
              “{rejected.comment}” — {rejected.by}, {formatDateTime(rejected.at)}
            </p>
          )}
        </Notice>,
      );
      break;
    default:
      break;
  }

  if (r.separationOfDuties) {
    notices.push(
      <Notice key="sod" icon={<Info aria-hidden />}>
        <p>{r.separationOfDuties}.</p>
      </Notice>,
    );
  }

  return notices.length > 0 ? <div className="space-y-2">{notices}</div> : null;
}
