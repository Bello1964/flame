import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiErrorBody,
  DataResponse,
  IssueReportRequest,
  IssuedReportDto,
  IssuedReportSummaryDto,
  NuprcMonthlyLogDto,
  NuprcQuarterlyReportDto,
  RecordSubmissionRequest,
} from '@flame/shared';
import { ApiError, apiGet, apiSend, withQuery } from '@/lib/api-client';

/** Every key starts with the organisation ID, so cached data never crosses organisations. */
export const nuprcKeys = {
  quarterly: (orgId: string, period: string) =>
    ['org', orgId, 'nuprc', 'quarterly', period] as const,
  monthly: (orgId: string, period: string) => ['org', orgId, 'nuprc', 'monthly', period] as const,
  issued: (orgId: string) => ['org', orgId, 'nuprc', 'issued'] as const,
  issuedOne: (orgId: string, id: string) => ['org', orgId, 'nuprc', 'issued', id] as const,
};

const base = (orgId: string) => `/organisations/${encodeURIComponent(orgId)}/reports`;

/** Live: recomputed by the API from approved data on every request. */
export function useNuprcQuarterly(orgId: string, period: string) {
  return useQuery({
    queryKey: nuprcKeys.quarterly(orgId, period),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<NuprcQuarterlyReportDto>>(
          withQuery(`${base(orgId)}/nuprc/quarterly`, { period }),
          { signal },
        )
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useNuprcMonthly(orgId: string, period: string) {
  return useQuery({
    queryKey: nuprcKeys.monthly(orgId, period),
    queryFn: async ({ signal }) =>
      (
        await apiGet<DataResponse<NuprcMonthlyLogDto>>(
          withQuery(`${base(orgId)}/nuprc/monthly`, { period }),
          { signal },
        )
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useIssuedReports(orgId: string) {
  return useQuery({
    queryKey: nuprcKeys.issued(orgId),
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<IssuedReportSummaryDto[]>>(`${base(orgId)}/issued`, { signal }))
        .data,
  });
}

export function useIssuedReport(orgId: string, id: string) {
  return useQuery({
    queryKey: nuprcKeys.issuedOne(orgId, id),
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<IssuedReportDto>>(`${base(orgId)}/issued/${id}`, { signal })).data,
  });
}

function useIssuedMutation<V>(
  orgId: string,
  send: (vars: V) => Promise<DataResponse<IssuedReportDto>>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => (await send(vars)).data,
    onSuccess: async (report) => {
      queryClient.setQueryData(nuprcKeys.issuedOne(orgId, report.id), report);
      await queryClient.invalidateQueries({ queryKey: nuprcKeys.issued(orgId) });
    },
  });
}

export function useIssueReport(orgId: string) {
  return useIssuedMutation(orgId, (body: IssueReportRequest) =>
    apiSend('POST', `${base(orgId)}/issued`, body),
  );
}

export function useApproveIssued(orgId: string) {
  return useIssuedMutation(orgId, (id: string) =>
    apiSend('POST', `${base(orgId)}/issued/${id}/approve`),
  );
}

export function useRejectIssued(orgId: string) {
  return useIssuedMutation(orgId, (vars: { id: string; comment: string }) =>
    apiSend('POST', `${base(orgId)}/issued/${vars.id}/reject`, { comment: vars.comment }),
  );
}

export function useRecordSubmission(orgId: string) {
  return useIssuedMutation(orgId, (vars: { id: string } & RecordSubmissionRequest) =>
    apiSend('POST', `${base(orgId)}/issued/${vars.id}/submission`, {
      submittedOn: vars.submittedOn,
      ...(vars.reference ? { reference: vars.reference } : {}),
    }),
  );
}

/** API path of a CSV: a live NUPRC report, or an issued snapshot. */
export function nuprcCsvPath(
  orgId: string,
  target:
    | { kind: 'quarterly' | 'monthly'; period: string; part: string }
    | { issuedId: string; part: string },
): string {
  if ('issuedId' in target) {
    return withQuery(`${base(orgId)}/issued/${target.issuedId}/csv`, { part: target.part });
  }
  return withQuery(`${base(orgId)}/nuprc/${target.kind}.csv`, {
    period: target.period,
    part: target.part,
  });
}

/** Downloads a CSV with the session cookie, using the file name the API suggests. */
export async function downloadNuprcCsv(path: string): Promise<void> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const error =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as ApiErrorBody).error
        : { code: 'HTTP_ERROR', message: `The download failed (${String(res.status)}).` };
    throw new ApiError(res.status, error.code, error.message);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'nuprc-report.csv';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
