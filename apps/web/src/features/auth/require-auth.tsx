import { createContext, use } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { SessionResponse } from '@carbon/shared';
import { ErrorState, FullPageState } from '@/components/page-state';
import { AppShellSkeleton } from '@/components/skeletons';
import { useSession } from './session';

const SessionContext = createContext<SessionResponse | null>(null);

/** The signed-in session. Only valid beneath <RequireAuth>. */
// eslint-disable-next-line react-refresh/only-export-components -- hook paired with its provider
export function useCurrentSession(): SessionResponse {
  const session = use(SessionContext);
  if (!session) throw new Error('useCurrentSession must be used beneath <RequireAuth>');
  return session;
}

/**
 * Renders protected routes only once a session is confirmed, so protected content never
 * flashes while the session is unresolved. No session sends the user to sign in.
 */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  // The shell's outline appears at once; protected content waits for the session.
  if (session.isPending) return <AppShellSkeleton />;

  if (session.isError) {
    return (
      <FullPageState>
        <ErrorState
          title="Could not check your session"
          error={session.error}
          onRetry={() => void session.refetch()}
        />
      </FullPageState>
    );
  }

  if (!session.data) {
    const next = `${location.pathname}${location.search}`;
    const to = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={to} replace />;
  }

  return (
    <SessionContext value={session.data}>
      <Outlet />
    </SessionContext>
  );
}
