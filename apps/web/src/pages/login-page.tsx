import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { BrandLockup } from '@/components/brand';
import flareDusk from '@/assets/landing/flare3.webp';
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
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      {/* The doorway between the two registers: the brand's Basalt and serif on the left,
          the working Limestone form on the right. */}
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-basalt p-12 text-limestone lg:flex">
        <img
          src={flareDusk}
          alt=""
          aria-hidden
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover object-[60%_35%] brightness-[0.5] grayscale-[0.6]"
        />
        <div
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--basalt)_70%,transparent)_0%,color-mix(in_srgb,var(--basalt)_30%,transparent)_45%,var(--basalt)_92%)]"
          aria-hidden
        />
        <Link
          to="/"
          className="self-start rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-oxide-on-dark"
          aria-label="Flame home"
        >
          <BrandLockup />
        </Link>
        <div className="max-w-lg">
          <p className="eyebrow text-muted-light">Gas-flaring emissions accounting</p>
          <p className="mt-5 font-display text-5xl leading-[1.02] text-balance">
            Activity data and emissions for every flare source, in one{' '}
            <em className="text-oxide-on-dark">accountable</em> record.
          </p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-light">
            Every change is attributed and audited. Access is limited to the organisations you
            belong to.
          </p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <header className="space-y-1">
            <Link to="/" className="inline-block lg:hidden" aria-label="Flame home">
              <BrandLockup tone="light" />
            </Link>
            <h1 className="pt-6 text-2xl font-semibold lg:pt-0">Sign in</h1>
            <p className="text-sm text-muted-foreground">Use your organisation account.</p>
          </header>
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginForm onSuccess={() => void navigate(next, { replace: true })} />
          </Suspense>
          <p className="text-sm">
            <Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
