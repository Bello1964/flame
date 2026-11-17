import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataResponse,
  InvitationAcceptRequest,
  InvitationLookupDto,
  SessionResponse,
} from '@flame/shared';
import { apiSend } from '@/lib/api-client';

/**
 * Public invitation endpoints (ARCHITECTURAL_WORKFLOW.md §7.2). The token travels in the
 * request body, never in an API URL. When the browser has a session, apiSend attaches its
 * CSRF token, so these must run only once the session check has finished.
 */
export const invitationKeys = {
  lookup: (token: string) => ['invitation', token] as const,
};

export function useInvitationLookup(token: string, enabled: boolean) {
  return useQuery({
    queryKey: invitationKeys.lookup(token),
    enabled,
    queryFn: async () =>
      (
        await apiSend<DataResponse<InvitationLookupDto>>('POST', '/invitations/lookup', {
          token,
        })
      ).data,
    // Failed lookups count towards the rate limit; don't repeat them on focus.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** The caller updates the session (replaceSession) itself, then navigates. */
export function useAcceptInvitation() {
  return useMutation({
    // Drop the submitted password from the mutation cache as soon as it settles.
    gcTime: 0,
    mutationFn: async (body: InvitationAcceptRequest) =>
      (await apiSend<DataResponse<SessionResponse>>('POST', '/invitations/accept', body)).data,
  });
}

export function useDeclineInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await apiSend<DataResponse<InvitationLookupDto>>('POST', '/invitations/decline', {
          token,
        })
      ).data,
    onSuccess: (result) => {
      queryClient.setQueryData(invitationKeys.lookup(token), result);
    },
  });
}
