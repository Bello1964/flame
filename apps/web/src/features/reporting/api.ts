import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ActivityType,
  ApiErrorBody,
  DataResponse,
  EmissionsReportDto,
  EmissionsTrendDto,
} from '@flame/shared';
import { ApiError, apiGet, withQuery } from '@/lib/api-client';

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

/**
 * Downloads the CSV through fetch, so a refusal (expired session, a facility that isn't
 * there) is reported as an error instead of being saved as a file.
 */
export async function downloadCsv(orgId: string, params: ReportParams): Promise<void> {
  const res = await fetch(csvHref(orgId, params), {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const error =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as ApiErrorBody).error
        : { code: 'HTTP_ERROR', message: `The export failed (${String(res.status)}).` };
    throw new ApiError(res.status, error.code, error.message);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `flame-emissions-${params.period}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
