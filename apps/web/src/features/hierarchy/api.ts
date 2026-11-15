import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AssetDto,
  DataResponse,
  FacilityDto,
  FlareSourceDto,
  FlareType,
  ListResponse,
} from '@carbon/shared';
import { apiGet, apiSend, withQuery } from '@/lib/api-client';

export type HierarchyResource = 'facilities' | 'assets' | 'flare-sources';

export interface DtoByResource {
  facilities: FacilityDto;
  assets: AssetDto;
  'flare-sources': FlareSourceDto;
}

export type StatusFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export interface ListParams {
  page: number;
  pageSize: number;
  status: StatusFilter;
  q?: string | undefined;
  /** Parent filter: facilityId for assets, assetId for flare sources. */
  facilityId?: string | undefined;
  assetId?: string | undefined;
}

// ─── Request bodies (match the API's strict schemas) ─────────────────────────

export interface FacilityCreateBody {
  name: string;
  code: string;
  description?: string | null;
  region?: string | null;
  country?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface AssetCreateBody {
  facilityId: string;
  name: string;
  code: string;
  assetType?: string | null;
  description?: string | null;
}

export interface FlareSourceCreateBody {
  assetId: string;
  name: string;
  code: string;
  flareType?: FlareType | null;
  description?: string | null;
}

export interface CreateBodyByResource {
  facilities: FacilityCreateBody;
  assets: AssetCreateBody;
  'flare-sources': FlareSourceCreateBody;
}

/** Parents cannot be changed after creation, so updates omit the parent ID. */
export interface UpdateBodyByResource {
  facilities: Partial<FacilityCreateBody>;
  assets: Partial<Omit<AssetCreateBody, 'facilityId'>>;
  'flare-sources': Partial<Omit<FlareSourceCreateBody, 'assetId'>>;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

/** Every key starts with the organisation ID, so cached data never crosses organisations. */
export const hierarchyKeys = {
  resource: (orgId: string, resource: HierarchyResource) => ['org', orgId, resource] as const,
  list: (orgId: string, resource: HierarchyResource, params: ListParams) =>
    ['org', orgId, resource, 'list', params] as const,
  detail: (orgId: string, resource: HierarchyResource, id: string) =>
    ['org', orgId, resource, 'detail', id] as const,
};

const base = (orgId: string, resource: HierarchyResource) =>
  `/organisations/${encodeURIComponent(orgId)}/${resource}`;

// ─── Queries ─────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 25;

/**
 * The list a page opens with: first page of active records. Prefetching uses the same
 * parameters so the prefetched result is exactly the one the page asks for.
 */
export function firstPageParams(parent?: Pick<ListParams, 'facilityId' | 'assetId'>): ListParams {
  return { page: 1, pageSize: PAGE_SIZE, status: 'ACTIVE', ...parent };
}

function listQuery<R extends HierarchyResource>(
  client: QueryClient,
  orgId: string,
  resource: R,
  params: ListParams,
) {
  return queryOptions({
    queryKey: hierarchyKeys.list(orgId, resource, params),
    queryFn: async () => {
      const res = await apiGet<ListResponse<DtoByResource[R]>>(
        withQuery(base(orgId, resource), {
          page: params.page,
          pageSize: params.pageSize,
          status: params.status,
          q: params.q,
          facilityId: params.facilityId,
          assetId: params.assetId,
        }),
      );
      // List rows are the same records the detail endpoint returns, so opening one
      // renders immediately from cache. Newer cached copies are never overwritten.
      const fetchedAt = Date.now();
      for (const record of res.data) {
        const key = hierarchyKeys.detail(orgId, resource, record.id);
        const cached = client.getQueryState(key);
        if (!cached?.data || cached.dataUpdatedAt < fetchedAt) {
          client.setQueryData(key, record, { updatedAt: fetchedAt });
        }
      }
      return res;
    },
  });
}

export function useHierarchyList<R extends HierarchyResource>(
  orgId: string,
  resource: R,
  params: ListParams,
) {
  const client = useQueryClient();
  return useQuery({
    ...listQuery(client, orgId, resource, params),
    // Keep the current page visible while the next one loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

/** Child lists shown on each record's page. */
const CHILD_LIST: Partial<
  Record<HierarchyResource, (id: string) => { resource: HierarchyResource; params: ListParams }>
> = {
  facilities: (id) => ({ resource: 'assets', params: firstPageParams({ facilityId: id }) }),
  assets: (id) => ({ resource: 'flare-sources', params: firstPageParams({ assetId: id }) }),
};

/**
 * Fetches what a record's page will need (its child list) before the user opens it,
 * e.g. on hover or focus. Fresh cached data is reused, so repeated calls are free.
 */
export function usePrefetchRecordPage() {
  const client = useQueryClient();
  return (orgId: string, resource: HierarchyResource, id: string) => {
    const child = CHILD_LIST[resource]?.(id);
    if (!child) return;
    client.query(listQuery(client, orgId, child.resource, child.params)).catch(() => {
      // Best effort: the page fetches again on open and shows any error there.
    });
  };
}

export function useHierarchyRecord<R extends HierarchyResource>(
  orgId: string,
  resource: R,
  /** Undefined while a parent ID is still loading; the query waits. */
  id: string | undefined,
) {
  return useQuery({
    queryKey: hierarchyKeys.detail(orgId, resource, id ?? ''),
    enabled: id !== undefined,
    queryFn: async () =>
      (
        await apiGet<DataResponse<DtoByResource[R]>>(
          `${base(orgId, resource)}/${encodeURIComponent(id ?? '')}`,
        )
      ).data,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useAfterWrite<R extends HierarchyResource>(orgId: string, resource: R) {
  const queryClient = useQueryClient();
  return async (record: DtoByResource[R]) => {
    queryClient.setQueryData(hierarchyKeys.detail(orgId, resource, record.id), record);
    await queryClient.invalidateQueries({ queryKey: hierarchyKeys.resource(orgId, resource) });
  };
}

export function useCreateRecord<R extends HierarchyResource>(orgId: string, resource: R) {
  const afterWrite = useAfterWrite(orgId, resource);
  return useMutation({
    mutationFn: async (body: CreateBodyByResource[R]) =>
      (await apiSend<DataResponse<DtoByResource[R]>>('POST', base(orgId, resource), body)).data,
    onSuccess: afterWrite,
  });
}

export function useUpdateRecord<R extends HierarchyResource>(
  orgId: string,
  resource: R,
  id: string,
) {
  const afterWrite = useAfterWrite(orgId, resource);
  return useMutation({
    mutationFn: async (body: UpdateBodyByResource[R]) =>
      (
        await apiSend<DataResponse<DtoByResource[R]>>(
          'PATCH',
          `${base(orgId, resource)}/${encodeURIComponent(id)}`,
          body,
        )
      ).data,
    onSuccess: afterWrite,
  });
}

export function useArchiveRecord<R extends HierarchyResource>(
  orgId: string,
  resource: R,
  id: string,
) {
  const afterWrite = useAfterWrite(orgId, resource);
  return useMutation({
    mutationFn: async () =>
      (
        await apiSend<DataResponse<DtoByResource[R]>>(
          'POST',
          `${base(orgId, resource)}/${encodeURIComponent(id)}/archive`,
        )
      ).data,
    onSuccess: afterWrite,
  });
}
