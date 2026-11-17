import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Building2,
  CircleCheck,
  Mail,
  PauseCircle,
  UserPlus,
} from 'lucide-react';
import type { PlatformOrganisationDto } from '@flame/shared';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCount, formatDateTime } from '@/lib/format';
import { DeliveryBadge } from '@/features/members/badges';
import { ConfirmButton } from '@/features/members/confirm-dialog';
import { INVITATION_RULES } from '@/features/members/labels';
import {
  useCreateOrganisation,
  useInviteOwner,
  usePlatformOrganisations,
  useRevokePlatformInvitation,
} from '@/features/platform-admin/api';
import { PlatformAdminOnly } from '@/features/platform-admin/admin-only';
import { CreateOrganisationDialog, EmailInviteDialog } from '@/features/platform-admin/dialogs';

const regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * /admin/organisations: Platform Administrators create organisations and invite their
 * first Owner, and re-invite an Owner for dormant ones. No tenant operational data.
 */
export function AdminOrganisationsPage() {
  return (
    <PlatformAdminOnly>
      <OrganisationsContent />
    </PlatformAdminOnly>
  );
}

function OrganisationsContent() {
  const organisations = usePlatformOrganisations();
  const create = useCreateOrganisation();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Organisations</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every organisation on the platform. You see only names and membership counts, never an
            organisation’s facilities, activity data or reports. An organisation without an active
            Owner is dormant: its members carry on, and only you can invite a new Owner.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          <Building2 aria-hidden />
          Create an organisation
        </Button>
      </header>

      {organisations.isPending ? (
        <TableSkeleton columns={4} rows={4} label="Loading organisations" />
      ) : organisations.isError ? (
        <ErrorState
          title="Could not load organisations"
          error={organisations.error}
          onRetry={() => void organisations.refetch()}
        />
      ) : organisations.data.length === 0 ? (
        <EmptyState
          title="No organisations yet"
          description="Create one and invite its first Owner."
        />
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {organisations.data.map((org) => (
            <OrganisationRow key={org.id} organisation={org} />
          ))}
        </ul>
      )}

      <CreateOrganisationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={create.isPending}
        submit={async (values) => {
          const created = await create.mutateAsync(values);
          toast.success(
            `${created.name} created. An Owner invitation was sent to ${values.ownerEmail.trim()}.`,
          );
        }}
      />
    </section>
  );
}

function OrganisationRow({ organisation: org }: { organisation: PlatformOrganisationDto }) {
  const invite = useInviteOwner();
  const revoke = useRevokePlatformInvitation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const pendingInvitation = org.pendingOwnerInvitation;

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{org.name}</p>
          <p className="text-xs text-muted-foreground">
            {countryName(org.country)} · {formatCount(org.activeMemberCount)} active{' '}
            {org.activeMemberCount === 1 ? 'member' : 'members'} · created{' '}
            {formatDateTime(org.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {org.status === 'SUSPENDED' ? (
            <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
              <PauseCircle aria-hidden />
              Suspended
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              <CircleCheck aria-hidden />
              Active
            </Badge>
          )}
          {org.dormant ? (
            <Badge variant="outline" className="border-warning/50 bg-warning/10 font-normal">
              <AlertTriangle aria-hidden />
              Dormant: no active Owner
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-normal">
              Has an active Owner
            </Badge>
          )}
        </div>
      </div>

      {org.dormant && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3">
          {pendingInvitation ? (
            <>
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 break-all">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  Owner invitation pending for {pendingInvitation.email}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <DeliveryBadge delivery={pendingInvitation.delivery} />
                  Expires {formatDateTime(pendingInvitation.expiresAt)}
                </p>
              </div>
              <ConfirmButton
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Revoke the Owner invitation for ${org.name}`}
                  >
                    <Ban aria-hidden />
                    Revoke
                  </Button>
                }
                title={`Revoke the Owner invitation to ${pendingInvitation.email}?`}
                description={
                  <p>
                    The link stops working straight away. You can then invite an Owner again, to the
                    same or a different email.
                  </p>
                }
                confirmLabel="Revoke invitation"
                pendingLabel="Revoking…"
                pending={revoke.isPending}
                error={revoke.error}
                onOpen={revoke.reset}
                onConfirm={(done) => {
                  revoke.mutate(pendingInvitation.id, {
                    onSuccess: () => {
                      toast.success(`Owner invitation for ${org.name} revoked.`);
                      done();
                    },
                  });
                }}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No pending Owner invitation. Members carry on, but nobody can grant the Owner role
                until a new Owner joins.
              </p>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Invite an Owner for ${org.name}`}
                onClick={() => {
                  setInviteOpen(true);
                }}
              >
                <UserPlus aria-hidden />
                Invite an Owner
              </Button>
            </>
          )}
        </div>
      )}

      <EmailInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={`Invite an Owner for ${org.name}`}
        description={
          <>
            They join {org.name} as its Owner. {INVITATION_RULES}
          </>
        }
        submitLabel="Send invitation"
        submitting={invite.isPending}
        submit={async (email) => {
          const sent = await invite.mutateAsync({ organisationId: org.id, body: { email } });
          toast.success(`Owner invitation sent to ${sent.email}.`);
        }}
      />
    </li>
  );
}
