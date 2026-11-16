import { useSearchParams } from 'react-router';
import { ACTIVITY_TYPES, type ActivityType } from '@flame/shared';
import type { ReportParams } from './api';
import { currentPeriod, granularityOf, isBeforeFloor } from './periods';

/** Report parameters live in the URL, so a report can be bookmarked, shared and printed. */
export function useReportParams() {
  const [search, setSearch] = useSearchParams();
  const raw = search.get('period') ?? '';
  const period = granularityOf(raw) && !isBeforeFloor(raw) ? raw : currentPeriod('MONTH');
  const type = search.get('type');
  const params: ReportParams = {
    period,
    facilityId: search.get('facility') ?? undefined,
    activityType: ACTIVITY_TYPES.includes(type as ActivityType)
      ? (type as ActivityType)
      : undefined,
  };

  function update(next: Partial<ReportParams>) {
    const merged = { ...params, ...next };
    const out: Record<string, string> = { period: merged.period };
    if (merged.facilityId) out['facility'] = merged.facilityId;
    if (merged.activityType) out['type'] = merged.activityType;
    setSearch(out, { replace: true });
  }

  /** The same parameters as a query string, for the print view. */
  const query = new URLSearchParams({
    period,
    ...(params.facilityId ? { facility: params.facilityId } : {}),
    ...(params.activityType ? { type: params.activityType } : {}),
  }).toString();

  return { params, update, query };
}
