import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AccountUpdateRequest,
  CurrentUser,
  DataResponse,
  PasswordChangeRequest,
  PasswordResetCompleteRequest,
  PasswordResetRequest,
  SessionResponse,
} from '@flame/shared';
import { apiSend } from '@/lib/api-client';
import { sessionQueryKey } from '@/features/auth/session';

/**
 * Password reset and the signed-in account (ARCHITECTURAL_WORKFLOW.md §7.3). Reset tokens
 * travel in the request body, never in an API URL. With a session in the browser, apiSend
 * attaches its CSRF token, so the public calls run only once the session check finished.
 */

/** Always answered the same way, whether or not the email has an account. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (body: PasswordResetRequest) =>
      apiSend<unknown>('POST', '/auth/password-reset/request', body),
  });
}

export function useCompletePasswordReset() {
  const queryClient = useQueryClient();
  return useMutation({
    // Drop the submitted password from the mutation cache as soon as it settles.
    gcTime: 0,
    mutationFn: (body: PasswordResetCompleteRequest) =>
      apiSend<undefined>('POST', '/auth/password-reset/complete', body),
    onSuccess: async () => {
      // If this browser was signed in to that account, its session has just ended.
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}

export function useUpdateAccountName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AccountUpdateRequest) =>
      (await apiSend<DataResponse<CurrentUser>>('PATCH', '/account', body)).data,
    onSuccess: (user) => {
      queryClient.setQueryData<SessionResponse | null>(sessionQueryKey, (session) =>
        session ? { ...session, user } : session,
      );
    },
  });
}

export function useChangePassword() {
  return useMutation({
    gcTime: 0,
    mutationFn: (body: PasswordChangeRequest) =>
      apiSend<undefined>('POST', '/account/password', body),
  });
}
