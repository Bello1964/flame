import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ROLES, type MemberDto, type MemberRemovalDto } from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fieldErrorsOf } from '@/lib/api-client';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { useOrganisation } from '@/features/organisations/organisation-context';
import {
  useCreateInvitation,
  useMemberStatusAction,
  useRemoveMember,
  useUpdateMemberRoles,
} from './api';
import { INVITATION_RULES, membershipErrorMessage, roleList } from './labels';
import { RoleCheckboxes } from './role-checkboxes';

const rolesSchema = z.array(z.enum(ROLES)).min(1, 'Choose at least one role');

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address')
    .pipe(z.email('Enter a valid email address').max(320, 'Use at most 320 characters')),
  roles: rolesSchema,
});
type InviteValues = z.infer<typeof inviteSchema>;

/** Invite someone to the organisation by email, with the roles they will hold. */
export function InviteMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const organisation = useOrganisation();
  const create = useCreateInvitation(organisation.organisationId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', roles: [] },
  });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    create.mutate(values, {
      onSuccess: (invitation) => {
        toast.success(`Invitation sent to ${invitation.email}.`);
        close(false);
      },
      onError: (error) => {
        const fields = fieldErrorsOf(error);
        let mapped = false;
        for (const key of ['email', 'roles'] as const) {
          const message = fields[key]?.[0];
          if (message) {
            setError(key, { type: 'server', message });
            mapped = true;
          }
        }
        if (!mapped) setFormError(membershipErrorMessage(error));
      },
    });
  });

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={close}
      title="Invite a member"
      description={
        <>
          We email them a link to join {organisation.organisationName}. {INVITATION_RULES}
        </>
      }
      submitLabel="Send invitation"
      submitting={create.isPending}
      isDirty={isDirty}
      formError={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <FormField label="Email" required error={errors.email?.message}>
        {(c) => <Input type="email" autoComplete="off" {...c} {...register('email')} />}
      </FormField>
      <Controller
        control={control}
        name="roles"
        render={({ field }) => (
          <RoleCheckboxes
            value={field.value}
            onChange={field.onChange}
            canGrantOwner={organisation.canGrantOwner}
            error={errors.roles?.message}
          />
        )}
      />
    </RecordFormDialog>
  );
}

const rolesFormSchema = z.object({ roles: rolesSchema });
type RolesValues = z.infer<typeof rolesFormSchema>;

/** Change a member's roles. Never offered for the viewer's own membership. */
export function EditRolesDialog({
  member,
  onOpenChange,
}: {
  member: MemberDto;
  onOpenChange: (open: boolean) => void;
}) {
  const organisation = useOrganisation();
  const update = useUpdateMemberRoles(organisation.organisationId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<RolesValues>({
    resolver: zodResolver(rolesFormSchema),
    defaultValues: { roles: member.roles },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    update.mutate(
      { membershipId: member.membershipId, body: { roles: values.roles } },
      {
        onSuccess: (saved) => {
          toast.success(`${saved.name}’s roles updated: ${roleList(saved.roles)}.`);
          onOpenChange(false);
        },
        onError: (error) => {
          setFormError(fieldErrorsOf(error)['roles']?.[0] ?? membershipErrorMessage(error));
        },
      },
    );
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={onOpenChange}
      title={`Roles for ${member.name}`}
      description={
        <>
          {member.email}. Changes take effect on their next action.
          {member.roles.includes('ORGANISATION_OWNER') &&
            ' Taking away the Owner role from the last active Owner leaves the organisation without one; only a Platform Administrator can then invite a new Owner.'}
        </>
      }
      submitLabel="Save roles"
      submitting={update.isPending}
      isDirty={isDirty}
      requireChanges
      formError={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <Controller
        control={control}
        name="roles"
        render={({ field }) => (
          <RoleCheckboxes
            value={field.value}
            onChange={field.onChange}
            canGrantOwner={organisation.canGrantOwner}
            initiallyOwner={member.roles.includes('ORGANISATION_OWNER')}
            error={errors.roles?.message}
          />
        )}
      />
    </RecordFormDialog>
  );
}

export type MemberConfirmAction = 'suspend' | 'reinstate' | 'remove';

/** Confirms suspending, reinstating or removing a member, saying exactly what happens. */
export function MemberActionDialog({
  member,
  action,
  onOpenChange,
  onRemoved,
}: {
  member: MemberDto;
  action: MemberConfirmAction;
  onOpenChange: (open: boolean) => void;
  onRemoved: (result: MemberRemovalDto) => void;
}) {
  const organisation = useOrganisation();
  const statusAction = useMemberStatusAction(organisation.organisationId);
  const remove = useRemoveMember(organisation.organisationId);
  const pending = statusAction.isPending || remove.isPending;
  const error = statusAction.error ?? remove.error;
  const isOwner = member.roles.includes('ORGANISATION_OWNER');
  const orgName = organisation.organisationName;

  const copy: Record<
    MemberConfirmAction,
    { title: string; body: string[]; confirm: string; pending: string }
  > = {
    suspend: {
      title: `Suspend ${member.name}?`,
      body: [
        `They lose access to ${orgName} straight away, until someone reinstates them. Suspension is temporary: their roles (${roleList(member.roles)}) and history are kept.`,
        ...(isOwner
          ? [
              'If they are the only active Owner, the organisation is left without one until they are reinstated or a Platform Administrator invites a new Owner.',
            ]
          : []),
      ],
      confirm: 'Suspend member',
      pending: 'Suspending…',
    },
    reinstate: {
      title: `Reinstate ${member.name}?`,
      body: [
        `They regain access to ${orgName} with the roles they had: ${roleList(member.roles)}.`,
      ],
      confirm: 'Reinstate member',
      pending: 'Reinstating…',
    },
    remove: {
      title: `Remove ${member.name} from ${orgName}?`,
      body: [
        'This ends their membership. To rejoin, they need a new invitation.',
        'Any reviews or approvals they have claimed in this organisation are released back to Submitted for someone else to pick up.',
        'If this is their last organisation, their account is disabled and signed out everywhere.',
        ...(isOwner
          ? [
              'If they are the only active Owner, only a Platform Administrator can then invite a new Owner.',
            ]
          : []),
      ],
      confirm: 'Remove member',
      pending: 'Removing…',
    },
  };
  const text = copy[action];

  const confirm = () => {
    if (action === 'remove') {
      remove.mutate(member.membershipId, {
        onSuccess: (result) => {
          onRemoved(result);
          onOpenChange(false);
        },
      });
      return;
    }
    statusAction.mutate(
      { membershipId: member.membershipId, action },
      {
        onSuccess: (saved) => {
          toast.success(
            action === 'suspend' ? `${saved.name} suspended.` : `${saved.name} reinstated.`,
          );
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {text.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && error !== undefined && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {membershipErrorMessage(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={action === 'reinstate' ? 'default' : 'destructive'}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? text.pending : text.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
