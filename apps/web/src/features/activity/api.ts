import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityRecordDto,
  ActivityRecordKind,
  ActivityType,
  DataResponse,
  ListResponse,
  MeasurementBasis,
  MeasurementMethod,
  OrganisationSettingsDto,
  PressureUnit,
  QuantityInput,
  RateUnit,
  TemperatureUnit,
  VolumeUnit,
} from '@carbon/shared';
import { apiGet, apiSend, withQuery } from '@/lib/api-client';

export type ActivityStatusFilter = 'DRAFT' | 'WITHDRAWN' | 'ALL';

export interface ActivityListParams {
  page: number;
  pageSize: number;
  status: ActivityStatusFilter;
  flareSourceId?: string;
  activityType?: ActivityType;
}

/** Fields shared by create and edit (the API's strict schema; unknown fields are rejected). */
export interface ActivityFields {
  periodStart: string;
  periodEnd: string | null;
  activityType: ActivityType;
  otherTypeDescription: string | null;
  averageRate: QuantityInput<RateUnit> | null;
  totalVolume: QuantityInput<VolumeUnit> | null;
  operatingHours: string | null;
  referenceTemperature: QuantityInput<TemperatureUnit>;
  referencePressure: QuantityInput<PressureUnit>;
  zSource: string | null;
  zReference: string | null;
  measurementBasis: MeasurementBasis;
  estimateExplanation: string | null;
  measurementMethod: MeasurementMethod;
  methodDescription: string | null;
  notes: string | null;
}

export interface ActivityCreateBody extends ActivityFields {
  flareSourceId: string;
  kind: ActivityRecordKind;
  acknowledgeOverlap?: boolean;
}

export interface ActivityUpdateBody extends ActivityFields {
  acknowledgeOverlap?: boolean;
}

/** Every key starts with the organisation ID, so cached data never crosses organisations. */
export const activityKeys = {
  all: (orgId: string) => ['org', orgId, 'activity'] as const,
  list: (orgId: string, params: ActivityListParams) =>
    ['org', orgId, 'activity', 'list', params] as const,
  detail: (orgId: string, id: string) => ['org', orgId, 'activity', 'detail', id] as const,
  settings: (orgId: string) => ['org', orgId, 'settings'] as const,
};

const base = (orgId: string) => `/organisations/${encodeURIComponent(orgId)}`;

export function useActivityList(orgId: string, params: ActivityListParams) {
  return useQuery({
    queryKey: activityKeys.list(orgId, params),
    queryFn: ({ signal }) =>
      apiGet<ListResponse<ActivityRecordDto>>(
        withQuery(`${base(orgId)}/activity-records`, {
          page: params.page,
          pageSize: params.pageSize,
          status: params.status,
          flareSourceId: params.flareSourceId,
          activityType: params.activityType,
        }),
        { signal },
      ),
    // Keep rows while paging or filtering; never across flare sources.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[4].flareSourceId === params.flareSourceId
        ? keepPreviousData(previous)
        : undefined,
  });
}

export function useActivityRecord(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: activityKeys.detail(orgId, id ?? ''),
    enabled: id !== undefined,
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<ActivityRecordDto>>(
          `${base(orgId)}/activity-records/${encodeURIComponent(id ?? '')}`,
          { signal },
        )
      ).data,
  });
}

function useAfterActivityWrite(orgId: string) {
  const queryClient = useQueryClient();
  return async (record: ActivityRecordDto) => {
    queryClient.setQueryData(activityKeys.detail(orgId, record.id), record);
    // Warnings on other records (overlaps) can change too, so refresh every activity query.
    await queryClient.invalidateQueries({ queryKey: activityKeys.all(orgId) });
  };
}

export function useCreateActivity(orgId: string) {
  const afterWrite = useAfterActivityWrite(orgId);
  return useMutation({
    mutationFn: async (body: ActivityCreateBody) =>
      (
        await apiSend<DataResponse<ActivityRecordDto>>(
          'POST',
          `${base(orgId)}/activity-records`,
          body,
        )
      ).data,
    onSuccess: afterWrite,
  });
}

export function useUpdateActivity(orgId: string, id: string) {
  const afterWrite = useAfterActivityWrite(orgId);
  return useMutation({
    mutationFn: async (body: ActivityUpdateBody) =>
      (
        await apiSend<DataResponse<ActivityRecordDto>>(
          'PATCH',
          `${base(orgId)}/activity-records/${encodeURIComponent(id)}`,
          body,
        )
      ).data,
    onSuccess: afterWrite,
  });
}

export function useWithdrawActivity(orgId: string, id: string) {
  const afterWrite = useAfterActivityWrite(orgId);
  return useMutation({
    mutationFn: async (reason: string) =>
      (
        await apiSend<DataResponse<ActivityRecordDto>>(
          'POST',
          `${base(orgId)}/activity-records/${encodeURIComponent(id)}/withdraw`,
          { reason },
        )
      ).data,
    onSuccess: afterWrite,
  });
}

export function useSettings(orgId: string) {
  return useQuery({
    queryKey: activityKeys.settings(orgId),
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<OrganisationSettingsDto>>(`${base(orgId)}/settings`, { signal }))
        .data,
  });
}

export function useUpdateSettings(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<OrganisationSettingsDto>) =>
      (
        await apiSend<DataResponse<OrganisationSettingsDto>>(
          'PATCH',
          `${base(orgId)}/settings`,
          body,
        )
      ).data,
    onSuccess: (settings) => {
      queryClient.setQueryData(activityKeys.settings(orgId), settings);
    },
  });
}
