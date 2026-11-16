import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { BrandLockup } from '@/components/brand';
import { preloadAllPagesWhenIdle } from '@/app/lazy-pages';
import { LoginFormSkeleton } from '@/components/skeletons';
import { safeRedirectPath } from '@/features/auth/safe-redirect';
import { useSession } from '@/features/auth/session';

// The form brings the validation libraries; loading it separately keeps them out of the
// first download for users who are already signed in. The page around it paints at once.
const LoginForm = lazy(async () => ({
  default: (await import('@/features/auth/login-form')).LoginForm,
}));

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const next = safeRedirectPath(params.get('next'));

  // Download the app's pages while the user types, so signing in lands instantly.
  useEffect(preloadAllPagesWhenIdle, []);

  // The form shows immediately; an existing session redirects as soon as it is confirmed.
  if (session.data) return <Navigate to={next} replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link
          to="/"
          className="self-start rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50"
          aria-label="Flame home"
        >
          <BrandLockup />
        </Link>
        <div className="max-w-md space-y-3">
          <p className="text-2xl leading-snug font-semibold">
            Activity data, emissions and evidence for gas-flaring operations, in one accountable
            record.
          </p>
          <p className="text-sm opacity-75">
            Every change is attributed and audited. Access is limited to the organisations you
            belong to.
          </p>
        </div>
        <p className="text-xs opacity-60">Emissions management</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <header className="space-y-1">
            <Link to="/" className="inline-block lg:hidden" aria-label="Flame home">
              <BrandLockup tone="light" />
            </Link>
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="text-sm text-muted-foreground">Use your organisation account.</p>
          </header>
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginForm onSuccess={() => void navigate(next, { replace: true })} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
