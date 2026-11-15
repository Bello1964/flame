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
