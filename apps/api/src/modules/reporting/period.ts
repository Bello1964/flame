import { REPORT_PERIOD_PATTERN, type ReportPeriodDto } from '@flame/shared';

/**
 * Calendar periods for reports (ARCHITECTURAL_WORKFLOW.md §8.2). Dates are plain calendar
 * dates (YYYY-MM-DD): activity records carry local dates in the time zone they were
 * entered in, so no time-zone conversion is involved in placing them.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Days in a month (1-based), using UTC so no time zone or DST is involved. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive number of days between two calendar dates. */
export function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** The calendar date a given number of days after `date`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

/** Parses "2026-03", "2026-Q1" or "2026"; null when the key isn't a valid period. */
export function parsePeriod(key: string): ReportPeriodDto | null {
  const match = REPORT_PERIOD_PATTERN.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000) return null;
  const [, , month, quarter] = match;

  if (month !== undefined) {
    const m = Number(month);
    const start = `${String(year)}-${pad(m)}-01`;
    const end = `${String(year)}-${pad(m)}-${pad(daysInMonth(year, m))}`;
    return {
      granularity: 'MONTH',
      key,
      label: `${monthName(m)} ${String(year)}`,
      start,
      end,
      days: daysBetween(start, end),
    };
  }
  if (quarter !== undefined) {
    const q = Number(quarter);
    const first = (q - 1) * 3 + 1;
    const last = first + 2;
    const start = `${String(year)}-${pad(first)}-01`;
    const end = `${String(year)}-${pad(last)}-${pad(daysInMonth(year, last))}`;
    return {
      granularity: 'QUARTER',
      key,
      label: `Q${String(q)} ${String(year)} (${monthName(first).slice(0, 3)}–${monthName(last).slice(0, 3)})`,
      start,
      end,
      days: daysBetween(start, end),
    };
  }
  const start = `${String(year)}-01-01`;
  const end = `${String(year)}-12-31`;
  return {
    granularity: 'YEAR',
    key,
    label: String(year),
    start,
    end,
    days: daysBetween(start, end),
  };
}

/** The twelve calendar months ending with `endMonth` ("YYYY-MM"), oldest first. */
export function trailingMonths(endMonth: string, count = 12): ReportPeriodDto[] {
  const [y, m] = endMonth.split('-').map(Number) as [number, number];
  const months: ReportPeriodDto[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const index = y * 12 + (m - 1) - i;
    const key = `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
    const period = parsePeriod(key);
    if (period) months.push(period);
  }
  return months;
}

/** Today's calendar date in an IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Days of [start, end] up to and including `today`; 0 for a period that hasn't begun. */
export function daysElapsed(start: string, end: string, today: string): number {
  if (today < start) return 0;
  return daysBetween(start, today < end ? today : end);
}
