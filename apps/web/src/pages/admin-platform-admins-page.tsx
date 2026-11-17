import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Crown, Mail, ShieldOff, UserPlus } from 'lucide-react';
import type { InvitationDto, PlatformAdminDto } from '@flame/shared';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { useCurrentSession } from '@/features/auth/require-auth';
import { DeliveryBadge } from '@/features/members/badges';
import { ConfirmButton } from '@/features/members/confirm-dialog';
import { INVITATION_RULES } from '@/features/members/labels';
import {
  useInvitePlatformAdmin,
  usePlatformAdmins,
  useRemovePlatformAdmin,
  useRevokePlatformInvitation,
} from '@/features/platform-admin/api';
import { PlatformAdminOnly } from '@/features/platform-admin/admin-only';
import { EmailInviteDialog } from '@/features/platform-admin/dialogs';

/**
 * /admin/platform-admins: any Platform Administrator invites others and revokes pending
 * invitations; only the supreme Platform Administrator removes administration rights.
 */
export function AdminPlatformAdminsPage() {
  return (
    <PlatformAdminOnly>
      <PlatformAdminsContent />
    </PlatformAdminOnly>
  );
}

function PlatformAdminsContent() {
  const admins = usePlatformAdmins();
  const invite = useInvitePlatformAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Platform administrators</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Platform Administrators maintain the methodology registry, create organisations and
            invite their first Owner. Being one gives no access to any organisation’s data.
          </p>
        </div>
        <Button
          onClick={() => {
            setInviteOpen(true);
          }}
        >
          <UserPlus aria-hidden />
          Invite an administrator
        </Button>
      </header>

      {admins.isPending ? (
        <TableSkeleton columns={3} rows={3} label="Loading Platform Administrators" />
      ) : admins.isError ? (
        <ErrorState
          title="Could not load Platform Administrators"
          error={admins.error}
          onRetry={() => void admins.refetch()}
        />
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Administrators</h2>
            {!admins.data.viewerIsSupremeAdmin && (
              <p className="text-sm text-muted-foreground">
                Only the supreme Platform Administrator can remove administration rights.
              </p>
            )}
            {admins.data.administrators.length === 0 ? (
              <EmptyState title="No Platform Administrators" />
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {admins.data.administrators.map((admin) => (
                  <AdminRow
                    key={admin.userId}
                    admin={admin}
                    canRemove={admins.data.viewerIsSupremeAdmin && !admin.isSupremeAdmin}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Pending invitations</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">{INVITATION_RULES}</p>
            </div>
            {admins.data.invitations.length === 0 ? (
              <EmptyState title="No pending invitations" />
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {admins.data.invitations.map((inv) => (
                  <PendingInvitationRow key={inv.id} invitation={inv} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <EmailInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite a Platform Administrator"
        description={
          <>
            They can then manage the methodology registry, organisations and other administrators.{' '}
            {INVITATION_RULES}
          </>
        }
        submitLabel="Send invitation"
        submitting={invite.isPending}
        submit={async (email) => {
          const sent = await invite.mutateAsync({ email });
          toast.success(`Invitation sent to ${sent.email}.`);
        }}
      />
    </section>
  );
}

function AdminRow({ admin, canRemove }: { admin: PlatformAdminDto; canRemove: boolean }) {
  const { user } = useCurrentSession();
  const remove = useRemovePlatformAdmin();

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {admin.name}
          {admin.userId === user.id && <Badge variant="muted">You</Badge>}
          {admin.isSupremeAdmin && (
            <Badge variant="secondary">
              <Crown aria-hidden />
              Supreme administrator
            </Badge>
          )}
          {admin.status === 'DISABLED' && (
            <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
              Account disabled
            </Badge>
          )}
        </p>
        <p className="text-xs break-all text-muted-foreground">
          {admin.email} · account created {formatDateTime(admin.createdAt)}
        </p>
      </div>
      {canRemove && (
        <ConfirmButton
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Remove administration rights from ${admin.name}`}
            >
              <ShieldOff aria-hidden />
              Remove admin status
            </Button>
          }
          title={`Remove ${admin.name}’s administration rights?`}
          description={
            <>
              <p>
                They can no longer manage the methodology registry, organisations or administrators.
              </p>
              <p>
                If they belong to no organisation, their account is disabled and signed out
                everywhere. Their organisation memberships, if any, are not affected.
              </p>
            </>
          }
          confirmLabel="Remove admin status"
          pendingLabel="Removing…"
          pending={remove.isPending}
          error={remove.error}
          onOpen={remove.reset}
          onConfirm={(done) => {
            remove.mutate(admin.userId, {
              onSuccess: (result) => {
                toast.success(
                  result.accountDisabled
                    ? `${admin.name} is no longer a Platform Administrator. They belong to no organisation, so their account was disabled.`
                    : `${admin.name} is no longer a Platform Administrator.`,
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

function PendingInvitationRow({ invitation }: { invitation: InvitationDto }) {
  const revoke = useRevokePlatformInvitation();
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium break-all">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {invitation.email}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <DeliveryBadge delivery={invitation.delivery} />
          Invited by {invitation.invitedBy.name} · expires {formatDateTime(invitation.expiresAt)}
        </p>
      </div>
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
          <p>The link stops working straight away. You can invite them again afterwards.</p>
        }
        confirmLabel="Revoke invitation"
        pendingLabel="Revoking…"
        pending={revoke.isPending}
        error={revoke.error}
        onOpen={revoke.reset}
        onConfirm={(done) => {
          revoke.mutate(invitation.id, {
            onSuccess: () => {
              toast.success(`Invitation to ${invitation.email} revoked.`);
              done();
            },
          });
        }}
      />
    </li>
  );
}
