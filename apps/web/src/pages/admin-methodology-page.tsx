import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, FilePlus2, Pencil, ShieldAlert } from 'lucide-react';
import type { MethodologyParameterDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { formatDateTime } from '@/lib/format';
import { useCurrentSession } from '@/features/auth/require-auth';
import { EditionStatusBadge } from '@/features/calculations/badges';
import { EditionView } from '@/features/methodology/edition-view';
import { DecisionDialog, ParameterDialog, TierDialog } from '@/features/methodology/admin-dialogs';
import {
  useAdminEdition,
  useAdminEditions,
  useApproveEdition,
  useDraftEdition,
  useWithdrawEdition,
} from '@/features/methodology/api';
import { ActionDialog } from '@/features/activity/workflow-actions';
import type { ActionConfig } from '@/features/activity/workflow-config';

const APPROVE: ActionConfig = {
  label: 'Approve edition',
  pending: 'Approving…',
  done: 'Edition approved.',
  icon: CheckCircle2,
  tone: 'primary',
  dialog: {
    title: 'Approve this edition?',
    description:
      'It becomes the edition every new calculation uses, and it can never be changed. The current edition becomes superseded but stays published, and existing calculations keep the edition they used.',
    comment: 'optional',
    commentLabel: '',
    placeholder: '',
  },
};

const WITHDRAW: ActionConfig = {
  label: 'Withdraw draft',
  pending: 'Withdrawing…',
  done: 'Draft withdrawn.',
  icon: ShieldAlert,
  tone: 'destructive',
  dialog: {
    title: 'Withdraw this draft?',
    description: 'It is kept for the record but can no longer be edited or approved.',
    comment: 'required',
    commentLabel: 'Reason',
    placeholder: 'e.g. Superseded by a different set of corrections',
  },
};

/**
 * /admin/methodology[/:editionId]: Platform Administrators draft and approve editions.
 * The API enforces who may do this; this page only hides it from others.
 */
export function AdminMethodologyPage() {
  const { editionId } = useParams();
  const { user } = useCurrentSession();

  if (!user.isPlatformAdmin) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="For Platform Administrators only"
          description="The methodology registry is maintained by Platform Administrators. Everyone can read the published editions."
          action={
            <Button asChild variant="outline">
              <Link to="/methodology">Read the methodology</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return editionId ? <AdminEdition id={editionId} /> : <AdminEditionList />;
}

function AdminEditionList() {
  const editions = useAdminEditions();
  const draft = useDraftEdition();
  const navigate = useNavigate();
  const hasDraft = editions.data?.some((e) => e.status === 'DRAFT') ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Methodology registry</h1>
          <p className="max-w-3xl text-muted-foreground">
            Editions of the calculation methodology. One administrator prepares a draft; a different
            one approves it. Approved editions never change.
          </p>
        </header>
        {editions.isPending ? (
          <LoadingState />
        ) : editions.isError ? (
          <ErrorState error={editions.error} onRetry={() => void editions.refetch()} />
        ) : editions.data.length === 0 ? (
          <EmptyState title="No editions yet" />
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {editions.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link to={`/admin/methodology/${e.id}`} className="row-link">
                    Edition {e.edition}: {e.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <EditionStatusBadge status={e.status} />
                    {e.approvedAt && <span>Approved {formatDateTime(e.approvedAt)}</span>}
                  </div>
                </div>
                {(e.status === 'APPROVED' || e.status === 'SUPERSEDED') && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={hasDraft || draft.isPending}
                    title={hasDraft ? 'Finish or withdraw the existing draft first' : undefined}
                    onClick={() => {
                      draft.mutate(e.id, {
                        onSuccess: (created) => {
                          toast.success(`Draft edition ${String(created.edition)} started.`);
                          void navigate(`/admin/methodology/${created.id}`);
                        },
                        onError: (err) => toast.error(err.message),
                      });
                    }}
                  >
                    <FilePlus2 aria-hidden />
                    Start a draft from this edition
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminEdition({ id }: { id: string }) {
  const edition = useAdminEdition(id);
  const approve = useApproveEdition(id);
  const withdraw = useWithdrawEdition(id);
  const [dialog, setDialog] = useState<'approve' | 'withdraw' | null>(null);
  const [editingParam, setEditingParam] = useState<MethodologyParameterDto | null>(null);
  const [editingDecision, setEditingDecision] = useState<number | null>(null);
  const [editingTier, setEditingTier] = useState<number | null>(null);

  if (edition.isPending) {
    return (
      <div className="space-y-6">
        <LoadingState label="Loading the edition" />
      </div>
    );
  }
  if (edition.isError) {
    return (
      <div className="space-y-6">
        <ErrorState error={edition.error} onRetry={() => void edition.refetch()} />
      </div>
    );
  }
  const e = edition.data;
  const draft = e.status === 'DRAFT';

  const controls = draft ? (
    <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-4">
      <p className="text-sm font-medium">Draft: not used by any calculation</p>
      <p className="text-sm">
        Edit the numbers and decisions below. A Platform Administrator who did not create or edit
        this draft must approve it.
      </p>
      {e.approvalBlockedReason && (
        <p className="text-sm text-muted-foreground">{e.approvalBlockedReason}.</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          disabled={!e.canApprove}
          onClick={() => {
            setDialog('approve');
          }}
        >
          <CheckCircle2 aria-hidden />
          Approve edition
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            setDialog('withdraw');
          }}
        >
          Withdraw draft
        </Button>
      </div>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      This edition can’t be changed. To make changes,{' '}
      <Link to="/admin/methodology" className="text-primary underline underline-offset-4">
        start a draft from it
      </Link>
      .
    </p>
  );

  const editButton = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="sm" aria-label={label} onClick={onClick}>
      <Pencil aria-hidden />
    </Button>
  );

  return (
    <div className="space-y-6">
      <p className="mb-4 text-sm">
        <Link to="/admin/methodology" className="text-primary underline-offset-4 hover:underline">
          ← Methodology registry
        </Link>
      </p>
      <EditionView
        edition={e}
        notice={controls}
        {...(draft
          ? {
              parameterAction: (p: MethodologyParameterDto) =>
                editButton(`Edit ${p.name}`, () => {
                  setEditingParam(p);
                }),
              decisionAction: (_d: unknown, i: number) =>
                editButton('Edit this decision', () => {
                  setEditingDecision(i);
                }),
              routeAction: (i: number) =>
                editButton('Edit this route’s reporting tier', () => {
                  setEditingTier(i);
                }),
            }
          : {})}
      />
      {dialog === 'approve' && (
        <ActionDialog
          config={APPROVE}
          pending={approve.isPending}
          error={approve.error}
          onCancel={() => {
            setDialog(null);
          }}
          onConfirm={() => {
            approve.mutate(undefined, {
              onSuccess: () => {
                toast.success(APPROVE.done);
                setDialog(null);
              },
            });
          }}
        />
      )}
      {dialog === 'withdraw' && (
        <ActionDialog
          config={WITHDRAW}
          pending={withdraw.isPending}
          error={withdraw.error}
          onCancel={() => {
            setDialog(null);
          }}
          onConfirm={(reason) => {
            withdraw.mutate(reason ?? '', {
              onSuccess: () => {
                toast.success(WITHDRAW.done);
                setDialog(null);
              },
            });
          }}
        />
      )}
      {editingParam && (
        <ParameterDialog
          edition={e}
          parameter={editingParam}
          onClose={() => {
            setEditingParam(null);
          }}
        />
      )}
      {editingTier !== null && (
        <TierDialog
          edition={e}
          index={editingTier}
          onClose={() => {
            setEditingTier(null);
          }}
        />
      )}
      {editingDecision !== null && (
        <DecisionDialog
          edition={e}
          index={editingDecision}
          onClose={() => {
            setEditingDecision(null);
          }}
        />
      )}
    </div>
  );
}
