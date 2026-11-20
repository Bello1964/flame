import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  NUPRC_REPORT_KINDS,
  type ReportFilters,
  type ReportPeriodDto,
} from '@flame/shared';
import { MONTHLY_PARTS, QUARTERLY_PARTS } from './nuprc-csv.js';
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

// ─── NUPRC reports (ARCHITECTURAL_WORKFLOW.md §8.3) ──────────────────────────

const quarterKey = z
  .string()
  .trim()
  .regex(/^\d{4}-Q[1-4]$/, 'Use a quarter such as 2026-Q3')
  .refine((v) => v >= '2000', 'Use a quarter from 2000');
const monthKey = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month such as 2026-07')
  .refine((v) => v >= '2000-01', 'Use a month from January 2000');

export const nuprcQuarterlyQuerySchema = z.strictObject({ period: quarterKey });
export const nuprcQuarterlyCsvQuerySchema = z.strictObject({
  period: quarterKey,
  part: z.enum(QUARTERLY_PARTS).default('appendix-c'),
});
export const nuprcMonthlyQuerySchema = z.strictObject({ period: monthKey });
export const nuprcMonthlyCsvQuerySchema = z.strictObject({
  period: monthKey,
  part: z.enum(MONTHLY_PARTS).default('entries'),
});

export const issuedListQuerySchema = z.strictObject({
  kind: z.enum(NUPRC_REPORT_KINDS).optional(),
  period: z.string().trim().max(10).optional(),
});

export const issueReportSchema = z.strictObject({
  kind: z.enum(NUPRC_REPORT_KINDS),
  period: z.string().trim().min(1).max(10),
  reason: z.string().trim().max(2000).optional(),
});

export const rejectIssuedSchema = z.strictObject({
  comment: z.string().trim().min(1, 'Say why the report is rejected').max(2000),
});

export const submissionSchema = z.strictObject({
  submittedOn: z.iso.date('Use a date such as 2026-08-15'),
  reference: z.string().trim().max(200).optional(),
});

export const issuedCsvQuerySchema = z.strictObject({
  part: z.enum([...QUARTERLY_PARTS, ...MONTHLY_PARTS]).optional(),
});
