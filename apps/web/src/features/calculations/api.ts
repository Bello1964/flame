import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalculationAction,
  CalculationDto,
  CalculationEventDto,
  CalculationRunRequest,
  CalculationStatus,
  DataResponse,
  FlareEfficiencyCreate,
  FlareEfficiencyDto,
  GasCompositionCreate,
  GasCompositionDto,
  ListResponse,
} from '@flame/shared';
import { ApiError, apiGet, apiSend, withQuery } from '@/lib/api-client';

/** Every key starts with the organisation ID, so cached data never crosses organisations. */
export const calculationKeys = {
  all: (orgId: string) => ['org', orgId, 'calculations'] as const,
  forRecord: (orgId: string, recordId: string) =>
    ['org', orgId, 'calculations', 'record', recordId] as const,
  list: (orgId: string, params: CalculationListParams) =>
    ['org', orgId, 'calculations', 'list', params] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'calculations', 'detail', id] as const,
  history: (orgId: string, id: string) => ['org', orgId, 'calculations', 'history', id] as const,
  compositions: (orgId: string, sourceId: string) =>
    ['org', orgId, 'inputs', 'compositions', sourceId] as const,
  efficiencies: (orgId: string, sourceId: string) =>
    ['org', orgId, 'inputs', 'efficiencies', sourceId] as const,
};

export interface CalculationListParams {
  page: number;
  pageSize: number;
  status: CalculationStatus | 'ALL';
  claimedBy?: 'me';
  sort?: 'created' | 'submitted';
}

const base = (orgId: string) => `/organisations/${encodeURIComponent(orgId)}`;

// ─── Inputs ───────────────────────────────────────────────────────────────────

export function useCompositions(orgId: string, sourceId: string) {
  return useQuery({
    queryKey: calculationKeys.compositions(orgId, sourceId),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<GasCompositionDto[]>>(
          `${base(orgId)}/flare-sources/${encodeURIComponent(sourceId)}/gas-compositions`,
          { signal },
        )
      ).data,
  });
}

export function useEfficiencies(orgId: string, sourceId: string) {
  return useQuery({
    queryKey: calculationKeys.efficiencies(orgId, sourceId),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<FlareEfficiencyDto[]>>(
          `${base(orgId)}/flare-sources/${encodeURIComponent(sourceId)}/flare-efficiencies`,
          { signal },
        )
      ).data,
  });
}

function useRefreshInputs(orgId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['org', orgId, 'inputs'] });
}

export function useCreateComposition(orgId: string, sourceId: string) {
  const refresh = useRefreshInputs(orgId);
  return useMutation({
    mutationFn: async (body: GasCompositionCreate) =>
      (
        await apiSend<DataResponse<GasCompositionDto>>(
          'POST',
          `${base(orgId)}/flare-sources/${encodeURIComponent(sourceId)}/gas-compositions`,
          body,
        )
      ).data,
    onSuccess: refresh,
  });
}

export function useCreateEfficiency(orgId: string, sourceId: string) {
  const refresh = useRefreshInputs(orgId);
  return useMutation({
    mutationFn: async (body: FlareEfficiencyCreate) =>
      (
        await apiSend<DataResponse<FlareEfficiencyDto>>(
          'POST',
          `${base(orgId)}/flare-sources/${encodeURIComponent(sourceId)}/flare-efficiencies`,
          body,
        )
      ).data,
    onSuccess: refresh,
  });
}

export function useWithdrawInput(orgId: string, kind: 'gas-compositions' | 'flare-efficiencies') {
  const refresh = useRefreshInputs(orgId);
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiSend('POST', `${base(orgId)}/${kind}/${encodeURIComponent(id)}/withdraw`, { reason }),
    onSuccess: refresh,
  });
}

// ─── Calculations ─────────────────────────────────────────────────────────────

export function useRecordCalculations(orgId: string, recordId: string, enabled = true) {
  return useQuery({
    queryKey: calculationKeys.forRecord(orgId, recordId),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<CalculationDto[]>>(
          `${base(orgId)}/activity-records/${encodeURIComponent(recordId)}/calculations`,
          { signal },
        )
      ).data,
  });
}

export function useCalculations(orgId: string, params: CalculationListParams) {
  return useQuery({
    queryKey: calculationKeys.list(orgId, params),
    queryFn: ({ signal }) =>
      apiGet<ListResponse<CalculationDto>>(
        withQuery(`${base(orgId)}/calculations`, {
          page: params.page,
          pageSize: params.pageSize,
          status: params.status,
          claimedBy: params.claimedBy,
          sort: params.sort,
        }),
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCalculation(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: calculationKeys.detail(orgId, id ?? ''),
    enabled: id !== undefined,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<CalculationDto>>(
          `${base(orgId)}/calculations/${encodeURIComponent(id ?? '')}`,
          { signal },
        )
      ).data,
  });
}

export function useCalculationHistory(orgId: string, id: string) {
  return useQuery({
    queryKey: calculationKeys.history(orgId, id),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<CalculationEventDto[]>>(
          `${base(orgId)}/calculations/${encodeURIComponent(id)}/history`,
          { signal },
        )
      ).data,
  });
}

function useAfterCalculationWrite(orgId: string) {
  const queryClient = useQueryClient();
  return async (calc: CalculationDto) => {
    queryClient.setQueryData(calculationKeys.detail(orgId, calc.id), calc);
    await queryClient.invalidateQueries({ queryKey: calculationKeys.all(orgId) });
  };
}

export function useRunCalculation(orgId: string, recordId: string) {
  const afterWrite = useAfterCalculationWrite(orgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CalculationRunRequest) =>
      (
        await apiSend<DataResponse<CalculationDto>>(
          'POST',
          `${base(orgId)}/activity-records/${encodeURIComponent(recordId)}/calculations`,
          body,
        )
      ).data,
    onSuccess: async (calc) => {
      await afterWrite(calc);
      await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'inputs'] });
    },
  });
}

export function useCalculationAction(orgId: string, id: string) {
  const afterWrite = useAfterCalculationWrite(orgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, comment }: { action: CalculationAction; comment?: string }) =>
      (
        await apiSend<DataResponse<CalculationDto>>(
          'POST',
          `${base(orgId)}/calculations/${encodeURIComponent(id)}/${action}`,
          comment ? { comment } : {},
        )
      ).data,
    onSuccess: afterWrite,
    // After a refusal the calculation has probably changed; don't keep offering stale actions.
    onError: async (error) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
        await queryClient.invalidateQueries({ queryKey: calculationKeys.all(orgId) });
      }
    },
  });
}
