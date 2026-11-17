import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Mail,
  PauseCircle,
  PlayCircle,
  UserMinus,
  UserPlus,
  UserRoundPen,
  X,
} from 'lucide-react';
import type { InvitationDto, MemberDto, MemberRemovalDto } from '@flame/shared';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import {
  useInvitations,
  useMembers,
  useOrganisationDetails,
  useRevokeInvitation,
} from '@/features/members/api';
import { DeliveryBadge, InvitationStatusBadge, MemberStatusBadge } from '@/features/members/badges';
import { ConfirmButton } from '@/features/members/confirm-dialog';
import { INVITATION_RULES, releasedClaimsText, roleList } from '@/features/members/labels';
import {
  EditRolesDialog,
  InviteMemberDialog,
  MemberActionDialog,
  type MemberConfirmAction,
} from '@/features/members/member-dialogs';

type OpenDialog =
  { kind: 'roles'; member: MemberDto } | { kind: MemberConfirmAction; member: MemberDto } | null;

/**
 * /o/:organisationId/members: Owners and Administrators manage the organisation's members
 * and invitations (ARCHITECTURAL_WORKFLOW.md §7.2). The API enforces every rule; this page
 * only offers the actions the viewer's roles allow and explains the rest.
 */
export function MembersPage() {
  const organisation = useOrganisation();

  if (!organisation.canReadMembers) {
    return (
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Members</h1>
        </header>
        <EmptyState
          title="Your roles don’t include managing members"
          description="Owners and Administrators manage who belongs to the organisation. Ask one of them if someone needs access."
        />
      </section>
    );
  }
  return <MembersContent />;
}

function MembersContent() {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const details = useOrganisationDetails(orgId);
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const members = useMembers(orgId, includeRemoved);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [removal, setRemoval] = useState<MemberRemovalDto | null>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Who belongs to {organisation.organisationName} and what they can do. Nobody can change
            their own roles or suspend or remove themselves.
          </p>
        </div>
        {organisation.canManageMembers && (
          <Button
            onClick={() => {
              setInviteOpen(true);
            }}
          >
            <UserPlus aria-hidden />
            Invite a member
          </Button>
        )}
      </header>

      {details.data?.dormant && <DormantNotice />}

      {removal && (
        <RemovalNotice
          result={removal}
          onDismiss={() => {
            setRemoval(null);
          }}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">People</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={includeRemoved}
              onChange={(e) => {
                setIncludeRemoved(e.target.checked);
              }}
            />
            Show removed members
          </label>
        </div>
        {members.isPending ? (
          <TableSkeleton columns={4} rows={4} label="Loading members" />
        ) : members.isError ? (
          <ErrorState
            title="Could not load members"
            error={members.error}
            onRetry={() => void members.refetch()}
          />
        ) : members.data.length === 0 ? (
          <EmptyState title="No members to show" />
        ) : (
          <MembersTable
            members={members.data}
            canManage={organisation.canManageMembers}
            onAction={setDialog}
          />
        )}
      </div>

      <InvitationsSection />

      {organisation.canManageMembers && (
        <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
      {dialog?.kind === 'roles' && (
        <EditRolesDialog
          key={dialog.member.membershipId}
          member={dialog.member}
          onOpenChange={close}
        />
      )}
      {dialog && dialog.kind !== 'roles' && (
        <MemberActionDialog
          key={`${dialog.kind}-${dialog.member.membershipId}`}
          member={dialog.member}
          action={dialog.kind}
          onOpenChange={close}
          onRemoved={(result) => {
            setRemoval(result);
          }}
        />
      )}
    </section>
  );
}

function DormantNotice() {
  return (
    <section
      role="note"
      aria-labelledby="dormant-heading"
      className="flex items-start gap-3 rounded-md border border-warning/50 bg-warning/10 p-4"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        <p id="dormant-heading" className="text-sm font-medium">
          This organisation has no active Owner
        </p>
        <p className="text-sm text-muted-foreground">
          Members carry on working as usual, but nobody here can grant the Owner role. A Platform
          Administrator must invite a new Owner. Reinstating a suspended Owner also restores one.
        </p>
      </div>
    </section>
  );
}

function RemovalNotice({ result, onDismiss }: { result: MemberRemovalDto; onDismiss: () => void }) {
  const claims = releasedClaimsText(result);
  return (
    <section
      role="status"
      className="flex items-start justify-between gap-3 rounded-md border bg-secondary/60 p-4"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {result.member.name} was removed. Rejoining needs a new invitation.
          </p>
          <p className="text-muted-foreground">{claims ?? 'They held no review claims here.'}</p>
          <p className="text-muted-foreground">
            {result.accountDisabled
              ? 'This was their last organisation, so their account was disabled and signed out.'
              : 'Their account stays active for their other organisations.'}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onDismiss}>
        <X aria-hidden />
      </Button>
    </section>
  );
}

function MembersTable({
  members,
  canManage,
  onAction,
}: {
  members: MemberDto[];
  canManage: boolean;
  onAction: (dialog: OpenDialog) => void;
}) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.membershipId}>
              <TableCell className="min-w-48">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {m.name}
                  {m.isSelf && <Badge variant="muted">You</Badge>}
                </div>
                <div className="text-xs break-all text-muted-foreground">{m.email}</div>
              </TableCell>
              <TableCell className="min-w-36 text-sm">{roleList(m.roles)}</TableCell>
              <TableCell>
                <MemberStatusBadge status={m.status} />
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <MemberActions member={m} onAction={onAction} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MemberActions({
  member,
  onAction,
}: {
  member: MemberDto;
  onAction: (dialog: OpenDialog) => void;
}) {
  if (member.isSelf) {
    return (
      <span className="text-xs text-muted-foreground">
        You can’t change your own membership. Ask another Owner or Administrator.
      </span>
    );
  }
  if (member.status === 'REMOVED') {
    return <span className="text-xs text-muted-foreground">Invite them again to rejoin.</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {member.status === 'ACTIVE' && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Change roles for ${member.name}`}
          onClick={() => {
            onAction({ kind: 'roles', member });
          }}
        >
          <UserRoundPen aria-hidden />
          Roles
        </Button>
      )}
      {member.status === 'ACTIVE' ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Suspend ${member.name}`}
          onClick={() => {
            onAction({ kind: 'suspend', member });
          }}
        >
          <PauseCircle aria-hidden />
          Suspend
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Reinstate ${member.name}`}
          onClick={() => {
            onAction({ kind: 'reinstate', member });
          }}
        >
          <PlayCircle aria-hidden />
          Reinstate
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        aria-label={`Remove ${member.name}`}
        onClick={() => {
          onAction({ kind: 'remove', member });
        }}
      >
        <UserMinus aria-hidden />
        Remove
      </Button>
    </div>
  );
}

function InvitationsSection() {
  const organisation = useOrganisation();
  const invitations = useInvitations(organisation.organisationId);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Invitations</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pending invitations, and those answered, revoked or expired in the last 30 days.{' '}
          {INVITATION_RULES}
        </p>
      </div>
      {invitations.isPending ? (
        <TableSkeleton columns={4} rows={2} label="Loading invitations" />
      ) : invitations.isError ? (
        <ErrorState
          title="Could not load invitations"
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
        />
      ) : invitations.data.length === 0 ? (
        <EmptyState title="No recent invitations" />
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {invitations.data.map((inv) => (
            <InvitationRow
              key={inv.id}
              invitation={inv}
              canManage={organisation.canManageMembers}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationRow({
  invitation,
  canManage,
}: {
  invitation: InvitationDto;
  canManage: boolean;
}) {
  const { organisationId } = useOrganisation();
  const revoke = useRevokeInvitation(organisationId);
  const pending = invitation.status === 'PENDING';

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium break-all">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {invitation.email}
        </p>
        <p className="text-sm text-muted-foreground">
          {roleList(invitation.roles)} · invited by {invitation.invitedBy.name},{' '}
          {formatDateTime(invitation.createdAt)}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <InvitationStatusBadge status={invitation.status} />
          <DeliveryBadge delivery={invitation.delivery} />
          {pending && <span>Expires {formatDateTime(invitation.expiresAt)}</span>}
          {invitation.status === 'EXPIRED' && (
            <span>Expired {formatDateTime(invitation.expiresAt)}</span>
          )}
          {invitation.revokedAt && <span>Revoked {formatDateTime(invitation.revokedAt)}</span>}
          {invitation.respondedAt && <span>Answered {formatDateTime(invitation.respondedAt)}</span>}
        </div>
      </div>
      {pending && canManage && (
        <ConfirmButton
          trigger={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Revoke the invitation to ${invitation.email}`}
            >
              <Ban aria-hidden />
              Revoke
            </Button>
          }
          title={`Revoke the invitation to ${invitation.email}?`}
          description={
            <p>
              The link stops working straight away. To give them a new link, invite them again
              afterwards.
            </p>
          }
          confirmLabel="Revoke invitation"
          pendingLabel="Revoking…"
          pending={revoke.isPending}
          error={revoke.error}
          onOpen={revoke.reset}
          onConfirm={(done) => {
            revoke.mutate(invitation.id, {
              onSuccess: () => {
                toast.success(
                  `Invitation to ${invitation.email} revoked. You can now invite them again.`,
                );
                done();
              },
            });
          }}
        />
      )}
    </li>
  );
}
