import { Prisma } from '../../generated/prisma/client.js';

type AuditScalar = string | number | boolean | null;

export type ChangeSet = Record<string, { before: AuditScalar; after: AuditScalar }>;

function toAuditScalar(value: unknown): AuditScalar {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new Error('Unsupported value in audit change set');
}

/**
 * Compares a validated partial update with the current record and returns only the
 * fields whose value actually changes, as { before, after }. Decimals are compared by
 * value, so "4.453210" over a stored 4.45321 is not a change, and are recorded as
 * exact strings. An empty result means the update would change nothing.
 */
export function changeSet(existing: object, input: object): ChangeSet {
  const current = existing as Record<string, unknown>;
  const changes: ChangeSet = {};

  for (const [key, next] of Object.entries(input)) {
    if (next === undefined) continue;
    const previous = current[key];

    const before = toAuditScalar(previous);
    const after =
      Prisma.Decimal.isDecimal(previous) && next !== null
        ? new Prisma.Decimal(String(next)).toString()
        : toAuditScalar(next);

    if (before !== after) changes[key] = { before, after };
  }
  return changes;
}

/**
 * Replaces each `after` with the value as stored in the saved row, so the audit log
 * records exactly what the database holds (e.g. a decimal's canonical form even when
 * the previous value was null).
 */
export function withStoredValues(changes: ChangeSet, saved: object): ChangeSet {
  const row = saved as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(changes).map(([key, change]) => [
      key,
      { before: change.before, after: toAuditScalar(row[key]) },
    ]),
  );
}

/** Keeps only the changed keys of an update input. */
export function onlyChanged<T extends object>(input: T, changes: ChangeSet): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key in changes)) as Partial<T>;
}
