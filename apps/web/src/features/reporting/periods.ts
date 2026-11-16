import type { ReportGranularity } from '@flame/shared';

/**
 * Period keys for navigation only. The API parses and validates every key itself and
 * returns the period's dates and label; nothing here decides what a report contains.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function granularityOf(key: string): ReportGranularity | null {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return 'MONTH';
  if (/^\d{4}-Q[1-4]$/.test(key)) return 'QUARTER';
  if (/^\d{4}$/.test(key)) return 'YEAR';
  return null;
}

/** The current month, quarter or year in the viewer's calendar. */
export function currentPeriod(granularity: ReportGranularity, now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (granularity === 'MONTH') return `${String(y)}-${pad(m)}`;
  if (granularity === 'QUARTER') return `${String(y)}-Q${String(Math.ceil(m / 3))}`;
  return String(y);
}

/** The period `step` periods before (negative) or after (positive) `key`. */
export function shiftPeriod(key: string, step: number): string {
  const g = granularityOf(key);
  const year = Number(key.slice(0, 4));
  if (g === 'MONTH') {
    const index = year * 12 + Number(key.slice(5, 7)) - 1 + step;
    return `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
  }
  if (g === 'QUARTER') {
    const index = year * 4 + Number(key.slice(6)) - 1 + step;
    return `${String(Math.floor(index / 4))}-Q${String((index % 4) + 1)}`;
  }
  return String(year + step);
}

/** Converts a period to another granularity, keeping the year (and month where possible). */
export function convertPeriod(key: string, to: ReportGranularity): string {
  const g = granularityOf(key);
  const year = key.slice(0, 4);
  const month =
    g === 'MONTH'
      ? Number(key.slice(5, 7))
      : g === 'QUARTER'
        ? (Number(key.slice(6)) - 1) * 3 + 1
        : 1;
  if (to === 'MONTH') return `${year}-${pad(month)}`;
  if (to === 'QUARTER') return `${year}-Q${String(Math.ceil(month / 3))}`;
  return year;
}

/** The month a 12-month trend should end with for this period: its last month. */
export function trendEndMonth(key: string): string {
  const g = granularityOf(key);
  const year = key.slice(0, 4);
  if (g === 'MONTH') return key;
  if (g === 'QUARTER') return `${year}-${pad(Number(key.slice(6)) * 3)}`;
  return `${year}-12`;
}

/** The earliest period the API accepts is in 2000. */
export function isBeforeFloor(key: string): boolean {
  return Number(key.slice(0, 4)) < 2000;
}
