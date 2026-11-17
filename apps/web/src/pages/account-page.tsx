import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { NEW_PASSWORD_MAX, NEW_PASSWORD_MIN, type CurrentUser } from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { useCurrentSession } from '@/features/auth/require-auth';
import { useChangePassword, useUpdateAccountName } from '@/features/account/api';
import { FormAlert } from '@/features/account/public-page-frame';

/** /account: the signed-in person's own name and password (ARCHITECTURAL_WORKFLOW.md §7.3). */
export function AccountPage() {
  const { user } = useCurrentSession();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Your account</h1>
        <p className="text-sm text-muted-foreground">
          Your name and password. They apply in every organisation you belong to.
        </p>
      </header>
      {/* Keyed on the saved name, so the form resets when it changes (e.g. in another tab). */}
      <ProfileForm key={user.name} user={user} />
      <PasswordForm email={user.email} />
    </section>
  );
}

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(200, 'Use at most 200 characters'),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileForm({ user }: { user: CurrentUser }) {
  const update = useUpdateAccountName();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    update.mutate(values, {
      onSuccess: () => {
        toast.success('Name saved.');
      },
      onError: (error) => {
        const message = fieldErrorsOf(error)['name']?.[0];
        if (message) setError('name', { type: 'server', message });
        else setFormError(errorMessage(error));
      },
    });
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-labelledby="profile-heading"
      className="grid max-w-2xl gap-4 rounded-md border bg-card p-4"
    >
      <div>
        <h2 id="profile-heading" className="text-base font-semibold">
          Profile
        </h2>
        <p className="text-sm text-muted-foreground">
          Your name is shown to the people you work with, for example on records you submit.
        </p>
      </div>
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={errors.name?.message}>
          {(c) => <Input autoComplete="name" {...c} {...register('name')} />}
        </FormField>
        <FormField
          label="Email"
          required
          description="Your sign-in address. It can’t be changed here."
        >
          {(c) => <Input type="email" autoComplete="username" readOnly value={user.email} {...c} />}
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={update.isPending || !isDirty}>
          {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {update.isPending ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </form>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Enter your current password')
      .max(NEW_PASSWORD_MAX, `Use at most ${String(NEW_PASSWORD_MAX)} characters`),
    newPassword: z
      .string()
      .min(NEW_PASSWORD_MIN, `Choose a password of at least ${String(NEW_PASSWORD_MIN)} characters`)
      .max(NEW_PASSWORD_MAX, `Use at most ${String(NEW_PASSWORD_MAX)} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordForm({ email }: { email: string }) {
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          reset();
          toast.success('Password changed. Your other devices were signed out.');
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          let mapped = false;
          for (const name of ['currentPassword', 'newPassword'] as const) {
            const message = fields[name]?.[0];
            if (message) {
              setError(name, { type: 'server', message });
              mapped = true;
            }
          }
          if (mapped) return;
          setFormError(
            error instanceof ApiError && error.status === 429
              ? 'Too many wrong passwords. Wait a few minutes and try again.'
              : errorMessage(error),
          );
        },
      },
    );
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-labelledby="password-heading"
      className="grid max-w-2xl gap-4 rounded-md border bg-card p-4"
    >
      <div>
        <h2 id="password-heading" className="text-base font-semibold">
          Change password
        </h2>
        <p className="text-sm text-muted-foreground">
          You stay signed in here; every other device is signed out. We’ll email you to confirm the
          change.
        </p>
      </div>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <FormAlert message={formError} />
      <FormField label="Current password" required error={errors.currentPassword?.message}>
        {(c) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...c}
            {...register('currentPassword')}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="New password"
          required
          description={`At least ${String(NEW_PASSWORD_MIN)} characters.`}
          error={errors.newPassword?.message}
        >
          {(c) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...c}
              {...register('newPassword')}
            />
          )}
        </FormField>
        <FormField label="Confirm new password" required error={errors.confirm?.message}>
          {(c) => (
            <Input type="password" autoComplete="new-password" {...c} {...register('confirm')} />
          )}
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {change.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}
