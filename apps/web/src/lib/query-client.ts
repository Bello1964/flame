import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { replaceSession, sessionQueryKey } from '@/features/auth/session';
import { ApiError } from './api-client';

/**
 * A 401 from any request means the session has ended (idle or absolute expiry, or
 * revoked elsewhere). Clear cached data and mark the session as gone; the route guard
 * then sends the user to sign in.
 */
function handleError(client: QueryClient, error: unknown): void {
  if (!(error instanceof ApiError)) return;

  if (error.status === 401 && client.getQueryData(sessionQueryKey)) {
    replaceSession(client, null);
    toast.info('Your session has ended. Sign in again to continue.', { id: 'session-ended' });
    return;
  }

  // The CSRF token no longer matches this session (e.g. signed in again in another tab).
  if (error.code === 'CSRF_REJECTED') {
    void client.invalidateQueries({ queryKey: sessionQueryKey });
  }
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        handleError(client, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        handleError(client, error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Never retry auth, permission or not-found responses; they will not change.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 1,
      },
    },
  });
  return client;
}
