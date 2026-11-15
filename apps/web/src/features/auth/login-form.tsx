import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useLogin } from './session';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
});

type LoginValues = z.infer<typeof loginSchema>;

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Email or password is incorrect.';
    if (error.status === 429) return 'Too many sign-in attempts. Wait a few minutes and try again.';
  }
  return errorMessage(error);
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, { onSuccess });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
      {login.isError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {loginErrorMessage(login.error)}
        </p>
      )}
      <FormField label="Email" required error={errors.email?.message}>
        {(control) => (
          <Input
            type="email"
            autoComplete="username"
            autoFocus
            {...control}
            {...register('email')}
          />
        )}
      </FormField>
      <FormField label="Password" required error={errors.password?.message}>
        {(control) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...control}
            {...register('password')}
          />
        )}
      </FormField>
      <Button type="submit" disabled={login.isPending} className="mt-2 w-full">
        {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
