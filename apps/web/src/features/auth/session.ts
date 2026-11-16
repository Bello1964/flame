import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DataResponse, SessionResponse } from '@flame/shared';
import { ApiError, apiGet, apiSend, setCsrfToken } from '@/lib/api-client';

export const sessionQueryKey = ['session'] as const;

const isIdentityData = (query: Query) => query.queryKey[0] !== sessionQueryKey[0];

function cancelIdentityData(client: QueryClient): void {
  client.cancelQueries({ predicate: isIdentityData }).catch(() => {
    // Cancellation failures are irrelevant; the queries are discarded next.
  });
}

/**
 * Replaces the session and drops every other cached query, so no data from a previous
 * identity survives. Used when the protected screens are about to unmount (sign-in,
 * sign-out, expiry). The session query itself is updated in place rather than removed,
 * so components already watching it (the route guard) see the change.
 */
export function replaceSession(client: QueryClient, session: SessionResponse | null): void {
  setCsrfToken(session?.csrfToken ?? null);
  cancelIdentityData(client);
  client.removeQueries({ predicate: isIdentityData });
  client.setQueryData(sessionQueryKey, session);
}

/** The signed-in session, or null when there is none (401). Other errors propagate. */
async function fetchSession(signal: AbortSignal): Promise<SessionResponse | null> {
  try {
    const res = await apiGet<DataResponse<SessionResponse>>('/auth/session', { signal });
    setCsrfToken(res.data.csrfToken);
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw err;
  }
}

const sessionQuery = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: async ({ client, signal }) => {
    const previous = client.getQueryData<SessionResponse | null>(sessionQueryKey);
    const current = await fetchSession(signal);

    // The browser's session cookie is shared by every tab, so a refetch (e.g. on window
    // focus) can reveal that the user signed out, or someone else signed in, elsewhere.
    // Data cached under the previous identity must not be shown under the new one.
    if (previous && current?.user.id !== previous.user.id) {
      cancelIdentityData(client);
      if (current) {
        // Screens stay mounted for the new user: reset (not remove) so they drop the old
        // data, show their loading state and refetch with the new session.
        client.resetQueries({ predicate: isIdentityData }).catch(() => {
          // Each screen shows its own error if its refetch fails.
        });
        toast.info(`You’re now signed in as ${current.user.name} (changed in another tab).`);
      } else {
        // Signed out elsewhere or expired: the route guard sends the user to sign in.
        client.removeQueries({ predicate: isIdentityData });
        toast.info('Your session has ended. Sign in again to continue.', { id: 'session-ended' });
      }
    }
    return current;
  },
  retry: false,
});

export function useSession() {
  return useQuery(sessionQuery);
}

/**
 * Starts the session check before React renders, so it runs alongside the download of
 * the first page instead of after it.
 */
export function prefetchSession(client: QueryClient): void {
  client.query(sessionQuery).catch(() => {
    // The route guard reads the same query and shows any error itself.
  });
}

export interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    // Drop the submitted credentials from the mutation cache as soon as it settles.
    gcTime: 0,
    mutationFn: (input: LoginInput) =>
      apiSend<DataResponse<SessionResponse>>('POST', '/auth/login', input),
    onSuccess: (res) => {
      // Drop anything cached under a previous identity before showing the new session.
      replaceSession(queryClient, res.data);
    },
  });
}

/** Signs out this session, or every session for the user when `everywhere` is true. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (everywhere: boolean) =>
      apiSend<undefined>('POST', everywhere ? '/auth/logout-all' : '/auth/logout'),
    onSettled: (_data, error) => {
      // A 401 means the session had already ended; treat it as signed out either way.
      if (error && !(error instanceof ApiError && error.status === 401)) return;
      replaceSession(queryClient, null);
    },
  });
}
