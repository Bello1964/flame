import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { DataResponse, SessionResponse } from '@carbon/shared';
import { ApiError, apiGet, apiSend, setCsrfToken } from '@/lib/api-client';

export const sessionQueryKey = ['session'] as const;

/**
 * Replaces the session and drops every other cached query, so no data from a previous
 * identity survives. The session query itself is updated in place rather than removed,
 * so components already watching it (the route guard) see the change.
 */
export function replaceSession(client: QueryClient, session: SessionResponse | null): void {
  setCsrfToken(session?.csrfToken ?? null);
  client.cancelQueries({ predicate: (q) => q.queryKey[0] !== sessionQueryKey[0] }).catch(() => {
    // Cancellation failures are irrelevant; the queries are removed next.
  });
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQueryKey[0] });
  client.setQueryData(sessionQueryKey, session);
}

/** The signed-in session, or null when there is none (401). Other errors propagate. */
async function fetchSession(): Promise<SessionResponse | null> {
  try {
    const res = await apiGet<DataResponse<SessionResponse>>('/auth/session');
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
  queryFn: fetchSession,
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
