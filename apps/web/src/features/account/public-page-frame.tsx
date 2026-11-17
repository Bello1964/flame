import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { BrandLockup } from '@/components/brand';

/** Frame for the public password pages: the brand header and a narrow column. */
export function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3">
        <Link to="/" className="inline-block" aria-label="Flame home">
          <BrandLockup tone="light" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10">{children}</main>
    </div>
  );
}

/** A form-level error, announced to assistive technology. */
export function FormAlert({ message }: { message: string | null | undefined }) {
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

/**
 * The heading of a screen that replaces a form (sent, changed, link not valid). It takes
 * focus when it appears, so screen readers announce the new screen and keyboard focus is
 * not lost with the form's submit button.
 */
export function ResultHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="text-2xl font-semibold outline-none">
      {children}
    </h1>
  );
}
