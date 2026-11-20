import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityAction,
  ActivityRecordDto,
  ActivityRecordEventDto,
  ActivityRecordKind,
  ActivityRecordStatus,
  BulkActivityAction,
  BulkActivityResult,
  ActivityType,
  DataResponse,
  ListResponse,
  MeasurementBasis,
  MeasurementMethod,
  OrganisationSettingsDto,
  OrganisationSettingsUpdate,
  PressureUnit,
  QuantityInput,
  RateUnit,
  TemperatureUnit,
  VolumeUnit,
} from '@flame/shared';
import { ApiError, apiGet, apiSend, withQuery } from '@/lib/api-client';

/** CURRENT: everything except withdrawn, rejected and superseded records. */
export type ActivityStatusFilter = ActivityRecordStatus | 'CURRENT' | 'ALL';

export interface ActivityListParams {
  page: number;
  pageSize: number;
  status: ActivityStatusFilter;
  flareSourceId?: string;
  activityType?: ActivityType;
  /** Only records the signed-in reviewer is reviewing. */
  claimedBy?: 'me';
  /** submitted: longest-waiting first (review queues). */
  sort?: 'period' | 'submitted';
}

/** Workflow actions sent to POST /activity-records/:id/<action>. */
export type TransitionAction = Exclude<ActivityAction, 'edit' | 'withdraw' | 'revise'>;

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
  compressibilitySource: string | null;
  measurementBasis: MeasurementBasis;
  estimateExplanation: string | null;
  measurementMethod: MeasurementMethod;
  methodDescription: string | null;
  notes: string | null;
  startTime: string | null;
  gasSource: string | null;
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
  history: (orgId: string, id: string) => ['org', orgId, 'activity', 'history', id] as const,
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
          claimedBy: params.claimedBy,
          sort: params.sort,
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

/** The record's history (edits, workflow steps and comments), oldest first. */
export function useActivityHistory(orgId: string, id: string) {
  return useQuery({
    queryKey: activityKeys.history(orgId, id),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<ActivityRecordEventDto[]>>(
          `${base(orgId)}/activity-records/${encodeURIComponent(id)}/history`,
          { signal },
        )
      ).data,
  });
}

/**
 * After the API refuses a step (403 or 409), the record has probably changed (e.g.
 * someone else claimed it), so refetch it rather than keep offering stale actions.
 */
function useRefreshOnRefusal(orgId: string) {
  const queryClient = useQueryClient();
  return async (error: unknown) => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
      await queryClient.invalidateQueries({ queryKey: activityKeys.all(orgId) });
    }
  };
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

/** Submit, review, forward, return, approve, reject, recall or release a review claim. */
export function useWorkflowAction(orgId: string, id: string) {
  const afterWrite = useAfterActivityWrite(orgId);
  const onError = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async ({ action, comment }: { action: TransitionAction; comment?: string }) =>
      (
        await apiSend<DataResponse<ActivityRecordDto>>(
          'POST',
          `${base(orgId)}/activity-records/${encodeURIComponent(id)}/${action}`,
          comment ? { comment } : {},
        )
      ).data,
    onSuccess: afterWrite,
    onError,
  });
}

/** Starts a revision of an approved record; resolves to the new draft. */
export function useReviseActivity(orgId: string, id: string) {
  const afterWrite = useAfterActivityWrite(orgId);
  const onError = useRefreshOnRefusal(orgId);
  return useMutation({
    mutationFn: async () =>
      (
        await apiSend<DataResponse<ActivityRecordDto>>(
          'POST',
          `${base(orgId)}/activity-records/${encodeURIComponent(id)}/revise`,
        )
      ).data,
    onSuccess: afterWrite,
    onError,
  });
}

/** Applies one action to many records; each record succeeds or fails on its own. */
export function useBulkActivityAction(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { action: BulkActivityAction; ids: string[]; comment?: string }) =>
      (
        await apiSend<DataResponse<BulkActivityResult[]>>(
          'POST',
          `${base(orgId)}/activity-records/bulk`,
          body,
        )
      ).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: activityKeys.all(orgId) }),
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
    mutationFn: async (body: OrganisationSettingsUpdate) =>
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
