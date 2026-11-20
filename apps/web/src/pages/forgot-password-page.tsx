import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, MailCheck } from 'lucide-react';
import { PASSWORD_RESET_VALIDITY_MINUTES } from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useSession } from '@/features/auth/session';
import { useRequestPasswordReset } from '@/features/account/api';
import { FormAlert, PublicPageFrame, ResultHeading } from '@/features/account/public-page-frame';

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
});
type Values = z.infer<typeof schema>;

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many reset requests. Wait a few minutes and try again.';
  }
  return errorMessage(error);
}

/**
 * /forgot-password: public. Asks for a reset link. The answer is the same whether or not
 * the email has an account, so this page never says which.
 */
export function ForgotPasswordPage() {
  const session = useSession();
  const reset = useRequestPasswordReset();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit((values) => {
    reset.mutate(values, {
      onSuccess: () => {
        setSentTo(values.email);
      },
    });
  });

  if (sentTo) {
    return (
      <PublicPageFrame>
        <section className="space-y-4">
          <MailCheck className="size-8 text-success" aria-hidden />
          <ResultHeading>Check your email</ResultHeading>
          <p className="text-sm text-muted-foreground">
            If <strong className="text-foreground">{sentTo}</strong> belongs to an account that can
            sign in, we’ve sent it a link to choose a new password. The link works once and expires
            after {PASSWORD_RESET_VALIDITY_MINUTES} minutes.
          </p>
          <p className="text-sm text-muted-foreground">
            Nothing arrived? Check your spam folder, or ask again. If your organisation removed your
            access, ask an administrator to invite you again instead.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSentTo(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        </section>
      </PublicPageFrame>
    );
  }

  return (
    <PublicPageFrame>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your account’s email address and we’ll send you a link to choose a new password.
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
          <FormAlert message={reset.isError ? requestErrorMessage(reset.error) : null} />
          <FormField label="Email" required error={errors.email?.message}>
            {(c) => (
              <Input type="email" autoComplete="username" autoFocus {...c} {...register('email')} />
            )}
          </FormField>
          {/* With a session in the browser, wait for its CSRF token before sending. */}
          <Button type="submit" disabled={reset.isPending || session.isPending} className="w-full">
            {reset.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {reset.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
        <p className="text-sm">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </PublicPageFrame>
  );
}
