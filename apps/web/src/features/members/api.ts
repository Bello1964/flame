import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataResponse,
  InvitationCreate,
  InvitationDto,
  MemberAction,
  MemberDto,
  MemberRemovalDto,
  MemberRolesUpdate,
  OrganisationDto,
} from '@flame/shared';
import { ApiError, apiGet, apiSend, withQuery } from '@/lib/api-client';

/**
 * Members and invitations of one organisation (ARCHITECTURAL_WORKFLOW.md §7.2). Every key
 * starts with the organisation ID, so cached data never crosses organisations.
 */
export const memberKeys = {
  organisation: (orgId: string) => ['org', orgId, 'organisation'] as const,
  all: (orgId: string) => ['org', orgId, 'members'] as const,
  list: (orgId: string, includeRemoved: boolean) =>
    ['org', orgId, 'members', 'list', { includeRemoved }] as const,
  invitations: (orgId: string) => ['org', orgId, 'members', 'invitations'] as const,
};

const base = (orgId: string) => `/organisations/${encodeURIComponent(orgId)}`;

/** The organisation itself, including whether it is dormant (no active Owner). */
export function useOrganisationDetails(orgId: string) {
  return useQuery({
    queryKey: memberKeys.organisation(orgId),
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<OrganisationDto>>(base(orgId), { signal })).data,
  });
}

export function useMembers(orgId: string, includeRemoved: boolean, enabled = true) {
  return useQuery({
    queryKey: memberKeys.list(orgId, includeRemoved),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<MemberDto[]>>(
          withQuery(`${base(orgId)}/members`, {
            includeRemoved: includeRemoved ? 'true' : undefined,
          }),
          { signal },
        )
      ).data,
  });
}

/** Pending invitations, and those that changed in the last 30 days. */
export function useInvitations(orgId: string, enabled = true) {
  return useQuery({
    queryKey: memberKeys.invitations(orgId),
    enabled,
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<InvitationDto[]>>(`${base(orgId)}/invitations`, { signal })).data,
  });
}

/**
 * After any membership change: members, invitations and the organisation's dormant state
 * can all change, so refresh them together. A refusal (403/409) usually means someone
 * else changed things meanwhile, so it refreshes too.
 */
function useRefreshMembers(orgId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: memberKeys.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: memberKeys.organisation(orgId) }),
    ]);
  };
}

function useRefreshOnRefusal(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  return async (error: unknown) => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
      await refresh();
    }
  };
}

const memberPath = (orgId: string, membershipId: string) =>
  `${base(orgId)}/members/${encodeURIComponent(membershipId)}`;

export function useUpdateMemberRoles(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  const onRefusal = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async ({ membershipId, body }: { membershipId: string; body: MemberRolesUpdate }) =>
      (await apiSend<DataResponse<MemberDto>>('PATCH', memberPath(orgId, membershipId), body)).data,
    onSuccess: refresh,
    onError: onRefusal,
  });
}

/** Suspend or reinstate. */
export function useMemberStatusAction(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  const onRefusal = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async ({
      membershipId,
      action,
    }: {
      membershipId: string;
      action: Exclude<MemberAction, 'remove'>;
    }) =>
      (
        await apiSend<DataResponse<MemberDto>>(
          'POST',
          `${memberPath(orgId, membershipId)}/${action}`,
        )
      ).data,
    onSuccess: refresh,
    onError: onRefusal,
  });
}

export function useRemoveMember(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  const onRefusal = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async (membershipId: string) =>
      (
        await apiSend<DataResponse<MemberRemovalDto>>(
          'POST',
          `${memberPath(orgId, membershipId)}/remove`,
        )
      ).data,
    onSuccess: refresh,
    onError: onRefusal,
  });
}

export function useCreateInvitation(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  const onRefusal = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async (body: InvitationCreate) =>
      (await apiSend<DataResponse<InvitationDto>>('POST', `${base(orgId)}/invitations`, body)).data,
    onSuccess: refresh,
    onError: onRefusal,
  });
}

export function useRevokeInvitation(orgId: string) {
  const refresh = useRefreshMembers(orgId);
  const onRefusal = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (
        await apiSend<DataResponse<InvitationDto>>(
          'POST',
          `${base(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
        )
      ).data,
    onSuccess: refresh,
    onError: onRefusal,
  });
}
