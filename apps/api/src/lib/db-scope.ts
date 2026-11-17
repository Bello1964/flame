import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which organisation's rows the database lets the current work see (Row-Level Security,
 * ARCHITECTURAL_WORKFLOW.md §11). Carried through async calls with AsyncLocalStorage and
 * applied to every query as transaction-local settings by the driver wrapper in prisma.ts.
 *
 * - `organisation`: the rows of one organisation (organisation-scoped API routes).
 * - `system`: every organisation, for the fixed list of cross-tenant code paths below.
 * - no scope: no organisation rows at all (fail closed).
 */
export type DbScope =
  { kind: 'organisation'; organisationId: string } | { kind: 'system'; reason: SystemScopeReason };

/**
 * The only code paths allowed to work across organisations. Adding one is a reviewed
 * change: `db-scope.test.ts` pins where withSystemScope is called.
 */
export const SYSTEM_SCOPE_REASONS = [
  /** Listing the signed-in user's memberships in every organisation. */
  'session',
  /** Public invitation links: lookup, accept, decline. */
  'invitation-link',
  /**
   * Platform Administrator pages: organisations, owner and platform invitations, and the
   * methodology registry (whose approval rule reads audit entries without an organisation).
   */
  'platform-admin',
  /** Delivering queued emails, some of which belong to organisation invitations. */
  'email-worker',
  /** Whether a removed member still belongs to any organisation. */
  'membership-check',
  /** Operator scripts and seeding, run outside the API. */
  'operator-script',
  /** Test fixtures and assertions (tests only; the app under test runs unscoped). */
  'test-fixtures',
] as const;
export type SystemScopeReason = (typeof SYSTEM_SCOPE_REASONS)[number];

const storage = new AsyncLocalStorage<DbScope>();

export function currentDbScope(): DbScope | undefined {
  return storage.getStore();
}

/**
 * Runs `fn` in a scope and awaits it there. Prisma queries are lazy (they start only when
 * awaited), so the result is awaited inside the scope; returning an unstarted query would
 * run it outside.
 */
function runIn<T>(scope: DbScope, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(scope, async () => {
    const result = await fn();
    return result;
  });
}

/** Runs `fn` with the rows of one organisation visible. */
export function withOrganisationScope<T>(
  organisationId: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  return runIn({ kind: 'organisation', organisationId }, fn);
}

/** Runs `fn` with every organisation's rows visible. Only for the reasons listed above. */
export function withSystemScope<T>(
  reason: SystemScopeReason,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  return runIn({ kind: 'system', reason }, fn);
}

/** The values of the two database settings for a scope ('' clears them). */
export function scopeSettings(scope: DbScope | undefined): {
  scope: string;
  organisationId: string;
} {
  if (!scope) return { scope: '', organisationId: '' };
  return scope.kind === 'organisation'
    ? { scope: 'organisation', organisationId: scope.organisationId }
    : { scope: 'system', organisationId: '' };
}
