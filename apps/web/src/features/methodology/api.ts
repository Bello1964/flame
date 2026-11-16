import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataResponse,
  MethodologyEditionDto,
  MethodologyEditionSummaryDto,
  MethodologyEditionUpdate,
  MethodologyParameterUpdate,
} from '@flame/shared';
import { apiGet, apiSend } from '@/lib/api-client';

/**
 * The methodology registry. Published editions are public (no organisation, no sign-in);
 * the admin endpoints are for Platform Administrators only, and the API enforces that.
 */
export const methodologyKeys = {
  published: ['methodology', 'published'] as const,
  edition: (id: string) => ['methodology', 'edition', id] as const,
  admin: ['methodology', 'admin'] as const,
  adminEdition: (id: string) => ['methodology', 'admin', id] as const,
};

export function usePublishedEditions() {
  return useQuery({
    queryKey: methodologyKeys.published,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<MethodologyEditionSummaryDto[]>>('/methodology/editions', {
          signal,
        })
      ).data,
  });
}

export function usePublishedEdition(id: string | undefined) {
  return useQuery({
    queryKey: methodologyKeys.edition(id ?? ''),
    enabled: id !== undefined,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<MethodologyEditionDto>>(
          `/methodology/editions/${encodeURIComponent(id ?? '')}`,
          { signal },
        )
      ).data,
  });
}

export function useAdminEditions() {
  return useQuery({
    queryKey: methodologyKeys.admin,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<MethodologyEditionSummaryDto[]>>('/admin/methodology/editions', {
          signal,
        })
      ).data,
  });
}

export function useAdminEdition(id: string | undefined) {
  return useQuery({
    queryKey: methodologyKeys.adminEdition(id ?? ''),
    enabled: id !== undefined,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<MethodologyEditionDto>>(
          `/admin/methodology/editions/${encodeURIComponent(id ?? '')}`,
          { signal },
        )
      ).data,
  });
}

function useAfterAdminWrite() {
  const queryClient = useQueryClient();
  return async (edition: MethodologyEditionDto) => {
    queryClient.setQueryData(methodologyKeys.adminEdition(edition.id), edition);
    await queryClient.invalidateQueries({ queryKey: ['methodology'] });
  };
}

const adminPath = (id: string) => `/admin/methodology/editions/${encodeURIComponent(id)}`;

export function useDraftEdition() {
  const afterWrite = useAfterAdminWrite();
  return useMutation({
    mutationFn: async (fromId: string) =>
      (await apiSend<DataResponse<MethodologyEditionDto>>('POST', `${adminPath(fromId)}/draft`))
        .data,
    onSuccess: afterWrite,
  });
}

export function useUpdateEdition(id: string) {
  const afterWrite = useAfterAdminWrite();
  return useMutation({
    mutationFn: async (body: MethodologyEditionUpdate) =>
      (await apiSend<DataResponse<MethodologyEditionDto>>('PATCH', adminPath(id), body)).data,
    onSuccess: afterWrite,
  });
}

export function useUpdateParameter(id: string) {
  const afterWrite = useAfterAdminWrite();
  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: MethodologyParameterUpdate }) =>
      (
        await apiSend<DataResponse<MethodologyEditionDto>>(
          'PATCH',
          `${adminPath(id)}/parameters/${encodeURIComponent(key)}`,
          body,
        )
      ).data,
    onSuccess: afterWrite,
  });
}

export function useApproveEdition(id: string) {
  const afterWrite = useAfterAdminWrite();
  return useMutation({
    mutationFn: async () =>
      (await apiSend<DataResponse<MethodologyEditionDto>>('POST', `${adminPath(id)}/approve`)).data,
    onSuccess: afterWrite,
  });
}

export function useWithdrawEdition(id: string) {
  const afterWrite = useAfterAdminWrite();
  return useMutation({
    mutationFn: async (reason: string) =>
      (
        await apiSend<DataResponse<MethodologyEditionDto>>('POST', `${adminPath(id)}/withdraw`, {
          reason,
        })
      ).data,
    onSuccess: afterWrite,
  });
}
