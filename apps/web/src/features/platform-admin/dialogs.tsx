import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { fieldErrorsOf } from '@/lib/api-client';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { membershipErrorMessage } from '@/features/members/labels';

const email = z
  .string()
  .trim()
  .min(1, 'Enter an email address')
  .pipe(z.email('Enter a valid email address').max(320, 'Use at most 320 characters'));

const emailSchema = z.object({ email });
type EmailValues = z.infer<typeof emailSchema>;

/**
 * A one-field dialog that sends an invitation to an email address. `submit` performs the
 * request; field errors from the API land on the field, anything else above the form.
 */
export function EmailInviteDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  submit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  submitLabel: string;
  submitting: boolean;
  submit: (email: string) => Promise<unknown>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await submit(values.email);
      close(false);
    } catch (error) {
      const message = fieldErrorsOf(error)['email']?.[0];
      if (message) setError('email', { type: 'server', message });
      else setFormError(membershipErrorMessage(error));
    }
  });

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      submitLabel={submitLabel}
      submitting={submitting}
      isDirty={isDirty}
      formError={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <FormField label="Email" required error={errors.email?.message}>
        {(c) => <Input type="email" autoComplete="off" {...c} {...register('email')} />}
      </FormField>
    </RecordFormDialog>
  );
}

const organisationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the organisation’s name')
    .max(200, 'Use at most 200 characters'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter ISO 3166-1 country code, e.g. NG'),
  ownerEmail: email,
});
export type OrganisationValues = z.infer<typeof organisationSchema>;

/** Create an organisation together with the invitation to its first Owner. */
export function CreateOrganisationDialog({
  open,
  onOpenChange,
  submitting,
  submit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  submit: (values: OrganisationValues) => Promise<unknown>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<OrganisationValues>({
    resolver: zodResolver(organisationSchema),
    defaultValues: { name: '', country: 'NG', ownerEmail: '' },
  });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await submit(values);
      close(false);
    } catch (error) {
      const fields = fieldErrorsOf(error);
      let mapped = false;
      for (const key of ['name', 'country', 'ownerEmail'] as const) {
        const message = fields[key]?.[0];
        if (message) {
          setError(key, { type: 'server', message });
          mapped = true;
        }
      }
      if (!mapped) setFormError(membershipErrorMessage(error));
    }
  });

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={close}
      title="Create an organisation"
      description="The organisation starts without members. Its first Owner receives an invitation by email and manages everyone else. You don’t become a member."
      submitLabel="Create and invite Owner"
      submitting={submitting}
      isDirty={isDirty}
      formError={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <FormField label="Organisation name" required error={errors.name?.message}>
        {(c) => <Input autoComplete="off" {...c} {...register('name')} />}
      </FormField>
      <FormField
        label="Country"
        required
        description="Two-letter ISO 3166-1 code, e.g. NG for Nigeria or GH for Ghana."
        error={errors.country?.message}
      >
        {(c) => (
          <Input
            autoComplete="off"
            maxLength={2}
            className="w-24 uppercase"
            {...c}
            {...register('country')}
          />
        )}
      </FormField>
      <FormField
        label="First Owner’s email"
        required
        description="They receive an invitation to join as Owner."
        error={errors.ownerEmail?.message}
      >
        {(c) => <Input type="email" autoComplete="off" {...c} {...register('ownerEmail')} />}
      </FormField>
    </RecordFormDialog>
  );
}
