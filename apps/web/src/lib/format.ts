const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** e.g. "15 Nov 2026, 14:05" in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

const count = new Intl.NumberFormat('en-GB');

export function formatCount(n: number): string {
  return count.format(n);
}

/**
 * A decimal string for display, with at most `maxDecimals` decimal places and no
 * trailing zeros. Display only: the API's exact value is never replaced by this.
 */
export function formatDecimal(value: string, maxDecimals = 6): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: maxDecimals }).format(n);
}

/** "2026-01-10" → "10 Jan 2026" (a calendar date, no time-zone shift). */
export function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? isoDate
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
}
