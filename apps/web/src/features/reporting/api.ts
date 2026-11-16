import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ActivityType,
  DataResponse,
  EmissionsReportDto,
  EmissionsTrendDto,
} from '@flame/shared';
import { apiGet, withQuery } from '@/lib/api-client';

export interface ReportParams {
  /** "2026-03", "2026-Q1" or "2026". */
  period: string;
  facilityId?: string | undefined;
  activityType?: ActivityType | undefined;
}

/** Every key starts with the organisation ID, so cached data never crosses organisations. */
export const reportKeys = {
  emissions: (orgId: string, params: ReportParams) =>
    ['org', orgId, 'reports', 'emissions', params] as const,
  trend: (orgId: string, endMonth: string, params: Omit<ReportParams, 'period'>) =>
    ['org', orgId, 'reports', 'trend', endMonth, params] as const,
};

const base = (orgId: string) => `/organisations/${encodeURIComponent(orgId)}/reports/emissions`;

const filters = (p: Omit<ReportParams, 'period'>) => ({
  facilityId: p.facilityId,
  activityType: p.activityType,
});

/** Live totals from approved calculations; recomputed by the API on every request. */
export function useEmissionsReport(orgId: string, params: ReportParams) {
  return useQuery({
    queryKey: reportKeys.emissions(orgId, params),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<EmissionsReportDto>>(
          withQuery(base(orgId), { period: params.period, ...filters(params) }),
          { signal },
        )
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useEmissionsTrend(
  orgId: string,
  endMonth: string,
  params: Omit<ReportParams, 'period'>,
) {
  return useQuery({
    queryKey: reportKeys.trend(orgId, endMonth, params),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<EmissionsTrendDto>>(
          withQuery(`${base(orgId)}/trend`, { endMonth, ...filters(params) }),
          { signal },
        )
      ).data,
    placeholderData: keepPreviousData,
  });
}

/** The CSV download (same-origin, the session cookie goes with it; the API audits it). */
export function csvHref(orgId: string, params: ReportParams): string {
  return `/api/v1${withQuery(`${base(orgId)}.csv`, { period: params.period, ...filters(params) })}`;
}
