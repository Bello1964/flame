import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { ArrowRight, History, ShieldCheck } from 'lucide-react';
import { BrandLockup } from '@/components/brand';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { useCurrentSession } from '@/features/auth/require-auth';
import { EditionView } from '@/features/methodology/edition-view';
import { usePublishedEdition, usePublishedEditions } from '@/features/methodology/api';
import { EDITION_STATUS_LABELS } from '@/features/calculations/labels';

/** Public frame for the methodology: readable without signing in. */
export function PublicShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/"
            aria-label="Flame home"
            className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
          >
            <BrandLockup subtitle="Calculation methodology" />
          </Link>
          <Button asChild variant="secondary" size="sm">
            <Link to="/app">
              Open Flame
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {aside && <aside className="lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
        <main id="main" className={cn('min-w-0', !aside && 'lg:col-span-2')}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Inside the app the page sits in the normal shell (sidebar and all); only the editions list is added. */
function InAppFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0">{children}</div>
      {aside && <aside className="xl:sticky xl:top-6 xl:self-start">{aside}</aside>}
    </div>
  );
}

/** Platform Administrators get a way to the registry from the empty state. */
function RegistryLink() {
  const { user } = useCurrentSession();
  if (!user.isPlatformAdmin) return null;
  return (
    <Button asChild>
      <Link to="/admin/methodology">
        <ShieldCheck aria-hidden />
        Open the methodology registry
      </Link>
    </Button>
  );
}

/** Scrolls to #anchor once the content it points at has rendered. */
function useScrollToHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [ready, hash]);
}

/**
 * The calculation methodology: /methodology[/editions/:id] publicly, and
 * /o/:organisationId/methodology[/editions/:id] inside the app. Every published edition
 * stays readable, so any past result can be traced to the exact rules and numbers it used.
 */
export function MethodologyPage() {
  const { editionId, organisationId } = useParams();
  const inApp = organisationId !== undefined;
  const base = inApp ? `/o/${organisationId}/methodology` : '/methodology';
  const Frame = inApp ? InAppFrame : PublicShell;
  const editions = usePublishedEditions();
  const current = editions.data?.find((e) => e.status === 'APPROVED');
  const edition = usePublishedEdition(editionId);
  useScrollToHash(edition.isSuccess);

  if (!editionId) {
    if (editions.isPending) {
      return (
        <Frame>
          <LoadingState label="Loading the methodology" />
        </Frame>
      );
    }
    if (editions.isError) {
      return (
        <Frame>
          <ErrorState
            title="Could not load the methodology"
            error={editions.error}
            onRetry={() => void editions.refetch()}
          />
        </Frame>
      );
    }
    if (!current) {
      return (
        <Frame>
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Calculation methodology</h1>
            <EmptyState
              title="Waiting for a Platform Administrator to approve an edition"
              description="Edition 1 has been prepared with every decision and number explained. It is published here, and emissions can be calculated, once a Platform Administrator approves it in the methodology registry."
              action={inApp ? <RegistryLink /> : undefined}
            />
          </div>
        </Frame>
      );
    }
    return <Navigate to={`${base}/editions/${current.id}`} replace />;
  }

  const aside = (
    <nav aria-label="Methodology editions" className="space-y-2">
      <p className="text-sm font-medium">All editions</p>
      {editions.data && editions.data.length > 0 ? (
        <ul className="space-y-1">
          {editions.data.map((e) => (
            <li key={e.id}>
              <Link
                to={`${base}/editions/${e.id}`}
                aria-current={e.id === editionId ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm hover:bg-muted',
                  e.id === editionId && 'bg-accent font-medium',
                )}
              >
                Edition {e.edition}
                <span className="block text-xs text-muted-foreground">
                  {EDITION_STATUS_LABELS[e.status]}
                  {e.approvedAt ? ` · ${formatDateTime(e.approvedAt)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </nav>
  );

  return (
    <Frame aside={aside}>
      {edition.isPending ? (
        <LoadingState label="Loading this edition" />
      ) : edition.isError ? (
        <EmptyState
          title="Methodology edition not found"
          description="It may not exist, or it hasn’t been approved."
          action={
            <Button asChild variant="outline">
              <Link to={base}>See the current edition</Link>
            </Button>
          }
        />
      ) : (
        <EditionView
          edition={edition.data}
          notice={
            edition.data.status === 'SUPERSEDED' && current ? (
              <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <History className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  A newer edition is in use. Results calculated with this edition keep it, and it
                  stays here for reference.{' '}
                  <Link
                    to={`${base}/editions/${current.id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    See edition {current.edition}
                  </Link>
                </span>
              </p>
            ) : undefined
          }
        />
      )}
    </Frame>
  );
}
