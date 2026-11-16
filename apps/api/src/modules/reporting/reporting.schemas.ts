import { z } from 'zod';
import { ACTIVITY_TYPES, type ReportFilters, type ReportPeriodDto } from '@flame/shared';
import { parsePeriod } from './period.js';

const filters = {
  facilityId: z.uuid().optional(),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
};

const periodKey = z
  .string()
  .trim()
  .transform((value, ctx): ReportPeriodDto => {
    const period = parsePeriod(value);
    if (!period) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Use a period such as 2026-03 (month), 2026-Q1 (quarter) or 2026 (year), from 2000',
      });
      return z.NEVER;
    }
    return period;
  });

export const reportQuerySchema = z.strictObject({ period: periodKey, ...filters });

export const trendQuerySchema = z.strictObject({
  endMonth: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month such as 2026-03')
    .refine((v) => v >= '2000-01', 'The trend can end no earlier than January 2000'),
  ...filters,
});

export function filtersOf(query: {
  facilityId?: string | undefined;
  activityType?: ReportFilters['activityType'] | undefined;
}): ReportFilters {
  return { facilityId: query.facilityId ?? null, activityType: query.activityType ?? null };
}
