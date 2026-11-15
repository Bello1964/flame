import type { Prisma } from '../generated/prisma/client.js';

/** Scoping columns are implied by the request; naming them would tell the client nothing. */
const SCOPE_COLUMNS = new Set(['organisationId']);

/**
 * The only unique fields a duplicate response may name, per Prisma model.
 *
 * Deliberately an allowlist. Naming a clashing field confirms that a record with that
 * value exists, so it is safe only for values that identify nothing outside the caller's
 * own organisation, such as the organisation-defined record codes below. Values that
 * identify people or accounts (e.g. User.email) must never be added here: the service
 * that handles them (sign-up, invitations, membership) must return a response that does
 * not reveal whether the account exists. Every unique constraint not listed here produces
 * a duplicate response without field details.
 */
const REPORTABLE_UNIQUE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  Facility: new Set(['code']),
  Asset: new Set(['code']),
  FlareSource: new Set(['code']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;
}

/**
 * Columns named by a unique index in Prisma's default form `{table}_{col}_{col}_key`.
 * Our columns are camelCase, so splitting on "_" after removing the table prefix is exact.
 * Returns null for an index name in any other form rather than guessing.
 */
function columnsFromIndexName(index: string, table: string | undefined): string[] | null {
  if (!table || !index.startsWith(`${table}_`) || !index.endsWith('_key')) return null;
  const middle = index.slice(table.length + 1, -'_key'.length);
  const columns = middle.split('_');
  return columns.every((c) => /^[A-Za-z][A-Za-z0-9]*$/.test(c)) ? columns : null;
}

/** The columns of the violated constraint, however this Prisma engine reports them. */
function violatedColumns(meta: Record<string, unknown>): string[] | null {
  // Query engine: meta.target.
  const target = stringArray(meta['target']);
  if (target) return target;

  // Driver adapters (this API): meta.driverAdapterError.cause.constraint.
  const adapterError = meta['driverAdapterError'];
  const cause = isRecord(adapterError) ? adapterError['cause'] : undefined;
  if (!isRecord(cause)) return null;
  const constraint = cause['constraint'];
  if (!isRecord(constraint)) return null;
  const table = typeof cause['table'] === 'string' ? cause['table'] : undefined;
  return (
    stringArray(constraint['fields']) ??
    (typeof constraint['index'] === 'string'
      ? columnsFromIndexName(constraint['index'], table)
      : null)
  );
}

/**
 * The fields to name in a duplicate response for a unique-constraint violation (Prisma
 * P2002), or null when none may be named: the model or columns can't be determined, or
 * any clashing column is not on the allowlist above. Scoping columns are never named.
 */
export function uniqueViolationFields(err: Prisma.PrismaClientKnownRequestError): string[] | null {
  const meta = err.meta;
  if (!isRecord(meta)) return null;

  const model = meta['modelName'];
  const reportable = typeof model === 'string' ? REPORTABLE_UNIQUE_FIELDS[model] : undefined;
  if (!reportable) return null;

  const fields = (violatedColumns(meta) ?? []).filter((c) => !SCOPE_COLUMNS.has(c));
  if (fields.length === 0 || !fields.every((f) => reportable.has(f))) return null;
  return fields;
}
