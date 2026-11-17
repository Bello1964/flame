import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AcceptFormError {
  /** Shown on the matching field. */
  fields?: { name?: string; password?: string };
  /** Shown above the form. */
  form?: string;
}

function FormAlert({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/** The invited email, read-only, so password managers save the right account. */
function EmailField({ email }: { email: string }) {
  return (
    <FormField label="Email" required description="The invitation is for this address.">
      {(c) => <Input type="email" autoComplete="username" readOnly value={email} {...c} />}
    </FormField>
  );
}

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;

const newAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(200, 'Use at most 200 characters'),
    password: z
      .string()
      .min(PASSWORD_MIN, `Choose a password of at least ${String(PASSWORD_MIN)} characters`)
      .max(PASSWORD_MAX, `Use at most ${String(PASSWORD_MAX)} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match',
  });
type NewAccountValues = z.infer<typeof newAccountSchema>;

/** No account exists for the invited email: create one and accept in one step. */
export function NewAccountForm({
  email,
  submitting,
  error,
  onSubmit,
}: {
  email: string;
  submitting: boolean;
  error: AcceptFormError | null;
  onSubmit: (values: { name: string; password: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewAccountValues>({
    resolver: zodResolver(newAccountSchema),
    defaultValues: { name: '', password: '', confirm: '' },
  });

  const submit = handleSubmit((values) => {
    onSubmit({ name: values.name, password: values.password });
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <FormAlert message={error?.form} />
      <EmailField email={email} />
      <FormField label="Your name" required error={errors.name?.message ?? error?.fields?.name}>
        {(c) => <Input autoComplete="name" {...c} {...register('name')} />}
      </FormField>
      <FormField
        label="Password"
        required
        description={`At least ${String(PASSWORD_MIN)} characters.`}
        error={errors.password?.message ?? error?.fields?.password}
      >
        {(c) => (
          <Input type="password" autoComplete="new-password" {...c} {...register('password')} />
        )}
      </FormField>
      <FormField label="Confirm password" required error={errors.confirm?.message}>
        {(c) => (
          <Input type="password" autoComplete="new-password" {...c} {...register('confirm')} />
        )}
      </FormField>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting && <Loader2 className="animate-spin" aria-hidden />}
        {submitting ? 'Creating your account…' : 'Create account and accept'}
      </Button>
    </form>
  );
}

const passwordSchema = z.object({
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(PASSWORD_MAX, `Use at most ${String(PASSWORD_MAX)} characters`),
});
type PasswordValues = z.infer<typeof passwordSchema>;

/**
 * An account exists for the invited email and nobody is signed in: its password accepts
 * the invitation and signs in, in one step (this also re-enables a disabled account).
 */
export function ExistingAccountForm({
  email,
  submitting,
  error,
  onSubmit,
}: {
  email: string;
  submitting: boolean;
  error: AcceptFormError | null;
  onSubmit: (password: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  });

  const submit = handleSubmit((values) => {
    onSubmit(values.password);
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <FormAlert message={error?.form} />
      <EmailField email={email} />
      <FormField
        label="Password"
        required
        description="The password of your existing Flame account."
        error={errors.password?.message ?? error?.fields?.password}
      >
        {(c) => (
          <Input type="password" autoComplete="current-password" {...c} {...register('password')} />
        )}
      </FormField>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting && <Loader2 className="animate-spin" aria-hidden />}
        {submitting ? 'Accepting…' : 'Sign in and accept'}
      </Button>
    </form>
  );
}
