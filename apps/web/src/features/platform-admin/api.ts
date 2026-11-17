import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataResponse,
  InvitationDto,
  OwnerInvitationCreate,
  PlatformAdminInvitationCreate,
  PlatformAdminRemovalDto,
  PlatformAdminsDto,
  PlatformOrganisationCreate,
  PlatformOrganisationDto,
} from '@flame/shared';
import { ApiError, apiGet, apiSend } from '@/lib/api-client';

/**
 * Platform administration (ARCHITECTURAL_WORKFLOW.md §6, §7.2): organisations and their
 * first Owner, and other Platform Administrators. No tenant operational data. The API
 * allows these to Platform Administrators only.
 */
export const platformKeys = {
  all: ['platform'] as const,
  organisations: ['platform', 'organisations'] as const,
  admins: ['platform', 'admins'] as const,
};

export function usePlatformOrganisations() {
  return useQuery({
    queryKey: platformKeys.organisations,
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<PlatformOrganisationDto[]>>('/admin/organisations', { signal }))
        .data,
  });
}

export function usePlatformAdmins() {
  return useQuery({
    queryKey: platformKeys.admins,
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<PlatformAdminsDto>>('/admin/platform-admins', { signal })).data,
  });
}

/** Refresh after a write, and after a refusal (someone else probably changed things). */
function useRefresh() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: platformKeys.all });
  return {
    onSuccess: refresh,
    onError: async (error: unknown) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
        await refresh();
      }
    },
  };
}

export function useCreateOrganisation() {
  return useMutation({
    mutationFn: async (body: PlatformOrganisationCreate) =>
      (await apiSend<DataResponse<PlatformOrganisationDto>>('POST', '/admin/organisations', body))
        .data,
    ...useRefresh(),
  });
}

export function useInviteOwner() {
  return useMutation({
    mutationFn: async ({
      organisationId,
      body,
    }: {
      organisationId: string;
      body: OwnerInvitationCreate;
    }) =>
      (
        await apiSend<DataResponse<InvitationDto>>(
          'POST',
          `/admin/organisations/${encodeURIComponent(organisationId)}/owner-invitation`,
          body,
        )
      ).data,
    ...useRefresh(),
  });
}

/** Revokes a Platform Administrator invitation or a dormant organisation's Owner invitation. */
export function useRevokePlatformInvitation() {
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (
        await apiSend<DataResponse<InvitationDto>>(
          'POST',
          `/admin/invitations/${encodeURIComponent(invitationId)}/revoke`,
        )
      ).data,
    ...useRefresh(),
  });
}

export function useInvitePlatformAdmin() {
  return useMutation({
    mutationFn: async (body: PlatformAdminInvitationCreate) =>
      (
        await apiSend<DataResponse<InvitationDto>>(
          'POST',
          '/admin/platform-admins/invitations',
          body,
        )
      ).data,
    ...useRefresh(),
  });
}

/** Supreme administrator only (the API enforces it). */
export function useRemovePlatformAdmin() {
  return useMutation({
    mutationFn: async (userId: string) =>
      (
        await apiSend<DataResponse<PlatformAdminRemovalDto>>(
          'POST',
          `/admin/platform-admins/${encodeURIComponent(userId)}/remove`,
        )
      ).data,
    ...useRefresh(),
  });
}
