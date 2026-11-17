import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Link2Off as LinkIcon, Loader2 } from 'lucide-react';
import {
  ACCOUNT_ERROR_CODES,
  NEW_PASSWORD_MAX,
  NEW_PASSWORD_MIN,
  PASSWORD_RESET_VALIDITY_MINUTES,
} from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { useSession } from '@/features/auth/session';
import { useCompletePasswordReset } from '@/features/account/api';
import { FormAlert, PublicPageFrame, ResultHeading } from '@/features/account/public-page-frame';

const schema = z
  .object({
    password: z
      .string()
      .min(NEW_PASSWORD_MIN, `Choose a password of at least ${String(NEW_PASSWORD_MIN)} characters`)
      .max(NEW_PASSWORD_MAX, `Use at most ${String(NEW_PASSWORD_MAX)} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match',
  });
type Values = z.infer<typeof schema>;

/**
 * /reset-password/:token: public. Sets a new password with the emailed link, which signs
 * the account out everywhere; the person then signs in with the new password.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const session = useSession();
  const complete = useCompletePasswordReset();
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    complete.mutate(
      { token, password: values.password },
      {
        onSuccess: () => {
          setState('done');
        },
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error.code === ACCOUNT_ERROR_CODES.PASSWORD_RESET_INVALID
          ) {
            setState('invalid');
            return;
          }
          const message = fieldErrorsOf(error)['password']?.[0];
          if (message) {
            setError('password', { type: 'server', message });
            return;
          }
          setFormError(
            error instanceof ApiError && error.status === 429
              ? 'Too many attempts. Wait a few minutes and try again.'
              : errorMessage(error),
          );
        },
      },
    );
  });

  if (state === 'done') {
    return (
      <PublicPageFrame>
        <section className="space-y-4">
          <CheckCircle2 className="size-8 text-primary" aria-hidden />
          <ResultHeading>Password changed</ResultHeading>
          <p className="text-sm text-muted-foreground">
            Your account was signed out on every device. Sign in with your new password.
          </p>
          <Button asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </section>
      </PublicPageFrame>
    );
  }

  if (state === 'invalid') {
    return (
      <PublicPageFrame>
        <section className="space-y-4">
          <LinkIcon className="size-8 text-muted-foreground" aria-hidden />
          <ResultHeading>This reset link isn’t valid any more</ResultHeading>
          <p className="text-sm text-muted-foreground">
            Links work once and expire after {PASSWORD_RESET_VALIDITY_MINUTES} minutes, and asking
            for a new link cancels older ones. Ask for a new link and use the most recent email.
          </p>
          <Button asChild variant="outline">
            <Link to="/forgot-password">Ask for a new link</Link>
          </Button>
        </section>
      </PublicPageFrame>
    );
  }

  return (
    <PublicPageFrame>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">
            You’ll be signed out everywhere, then you can sign in with the new password.
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
          <FormAlert message={formError} />
          <FormField
            label="New password"
            required
            description={`At least ${String(NEW_PASSWORD_MIN)} characters.`}
            error={errors.password?.message}
          >
            {(c) => (
              <Input
                type="password"
                autoComplete="new-password"
                autoFocus
                {...c}
                {...register('password')}
              />
            )}
          </FormField>
          <FormField label="Confirm new password" required error={errors.confirm?.message}>
            {(c) => (
              <Input type="password" autoComplete="new-password" {...c} {...register('confirm')} />
            )}
          </FormField>
          <Button
            type="submit"
            disabled={complete.isPending || session.isPending}
            className="w-full"
          >
            {complete.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {complete.isPending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </div>
    </PublicPageFrame>
  );
}
