import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { currentDbScope, scopeSettings, type DbScope } from './db-scope.js';

type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Transaction = Awaited<ReturnType<Adapter['startTransaction']>>;
type SqlQuery = Parameters<Adapter['queryRaw']>[0];

const TEXT_ARG = { scalarType: 'string', arity: 'scalar' } as const;

/** Applies a scope as transaction-local settings, read by the Row-Level Security policies. */
function setScopeQuery(settings: { scope: string; organisationId: string }): SqlQuery {
  return {
    sql: "SELECT set_config('flame.scope', $1, true), set_config('flame.organisation_id', $2, true)",
    args: [settings.scope, settings.organisationId],
    argTypes: [TEXT_ARG, TEXT_ARG],
  };
}

const statement = (sql: string): SqlQuery => ({ sql, args: [], argTypes: [] });

/** Transaction control statements, which never need the scope applied before them. */
const CONTROL = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\s+TRANSACTION)\b/i;
const UNDOES_SETTINGS = /^\s*ROLLBACK\s+TO\b/i;

const keyOf = (s: { scope: string; organisationId: string }): string =>
  `${s.scope}|${s.organisationId}`;

/**
 * Inside a transaction, applies the current scope before the first statement and again
 * whenever it changes (e.g. a system-scope step inside an organisation-scoped transaction).
 */
function scopedTransaction(tx: Transaction, fallback: DbScope | undefined): Transaction {
  const NOTHING = keyOf(scopeSettings(undefined));
  let applied = NOTHING;
  const before = async (sql: string): Promise<void> => {
    if (UNDOES_SETTINGS.test(sql)) {
      // Rolling back to a savepoint may undo settings made after it.
      applied = 'unknown';
      return;
    }
    if (CONTROL.test(sql)) return;
    const settings = scopeSettings(currentDbScope() ?? fallback);
    const key = keyOf(settings);
    if (key === applied) return;
    await tx.executeRaw(setScopeQuery(settings));
    applied = key;
  };
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === 'queryRaw') {
        return async (query: SqlQuery) => {
          await before(query.sql);
          return target.queryRaw(query);
        };
      }
      if (property === 'executeRaw') {
        return async (query: SqlQuery) => {
          await before(query.sql);
          return target.executeRaw(query);
        };
      }
      if (property === 'rollbackToSavepoint') {
        const original = target.rollbackToSavepoint?.bind(target);
        if (!original) return undefined;
        return async (name: string) => {
          applied = 'unknown';
          await original(name);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * Wraps the pg driver adapter so every query carries the current database scope
 * (lib/db-scope.ts). A scoped query outside a transaction runs in a short transaction of
 * its own, so the transaction-local settings apply to it and never leak to the next user
 * of the pooled connection. A query with no scope runs as is and sees no organisation rows.
 */
function scopedAdapter(adapter: Adapter, fallback: DbScope | undefined): Adapter {
  async function inShortTransaction<T>(
    run: (tx: Transaction) => Promise<T>,
    settings: { scope: string; organisationId: string },
  ): Promise<T> {
    const tx = await adapter.startTransaction();
    try {
      await tx.executeRaw(setScopeQuery(settings));
      const result = await run(tx);
      await tx.executeRaw(statement('COMMIT'));
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.executeRaw(statement('ROLLBACK'));
      } catch {
        // The connection is released below either way; the original error matters.
      }
      await tx.rollback();
      throw err;
    }
  }

  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === 'queryRaw' || property === 'executeRaw') {
        return async (query: SqlQuery) => {
          const settings = scopeSettings(currentDbScope() ?? fallback);
          if (settings.scope === '') {
            return property === 'queryRaw' ? target.queryRaw(query) : target.executeRaw(query);
          }
          return property === 'queryRaw'
            ? inShortTransaction((tx) => tx.queryRaw(query), settings)
            : inShortTransaction((tx) => tx.executeRaw(query), settings);
        };
      }
      if (property === 'startTransaction') {
        return async (...args: Parameters<Adapter['startTransaction']>) =>
          scopedTransaction(await target.startTransaction(...args), fallback);
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/** Longest a connection may sit idle inside an open transaction before PostgreSQL ends it. */
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

/** Longest an interactive transaction waits for a database connection before failing. */
export const TRANSACTION_MAX_WAIT_MS = 15_000;

export interface PrismaClientOptions {
  /**
   * Scope used when no scope is active (lib/db-scope.ts). The API leaves it unset, so
   * work outside any scope sees no organisation rows. Operator scripts and test fixtures
   * pass a system scope.
   */
  fallbackScope?: DbScope;
}

export function createPrismaClient(
  databaseUrl: string,
  options: PrismaClientOptions = {},
): PrismaClient {
  const factory = new PrismaPg({
    connectionString: databaseUrl,
    // A transaction left idle (e.g. by a crashed request) is ended by PostgreSQL, so it can
    // never hold locks indefinitely (ARCHITECTURAL_WORKFLOW.md §11).
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });
  const adapter = new Proxy(factory, {
    get(target, property, receiver) {
      if (property === 'connect') {
        return async () => scopedAdapter(await target.connect(), options.fallbackScope);
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  const client = new PrismaClient({
    adapter,
    // Waiting for a connection before an interactive transaction starts (Prisma's default
    // is 2 s). A hosted database that auto-suspends when idle (Neon free tier: after 5 min)
    // can take longer to wake and complete TLS, which failed the first transaction with
    // P2028. The transaction's own running time keeps Prisma's 5 s default.
    transactionOptions: { maxWait: TRANSACTION_MAX_WAIT_MS },
  });
  keepRequestsInCallerScope(client, options.fallbackScope);
  return client;
}

interface BatchableRequest {
  transaction?: { kind?: string };
}
interface RequestLoader {
  options: { batchBy: (request: BatchableRequest) => string | undefined };
}

function requestLoaderOf(client: PrismaClient): RequestLoader | null {
  const handler: unknown = Reflect.get(client, '_requestHandler');
  if (typeof handler !== 'object' || handler === null) return null;
  const loader: unknown = Reflect.get(handler, 'dataloader');
  if (typeof loader !== 'object' || loader === null) return null;
  const options: unknown = Reflect.get(loader, 'options');
  if (typeof options !== 'object' || options === null) return null;
  return typeof Reflect.get(options, 'batchBy') === 'function' ? (loader as RequestLoader) : null;
}

/**
 * Prisma batches some requests (findUnique, and statements of array transactions) and
 * sends each batch from a process.nextTick callback, which carries the async context of
 * whichever request scheduled it, not of each request in it. The scope would then come
 * from the wrong caller. So batching is switched off: every request goes straight to the
 * driver in its caller's own context (batching is only an optimisation). Array
 * transactions, which need it, are refused while a scope is active; use interactive
 * transactions instead. This touches Prisma internals, so a client whose internals have
 * changed (e.g. after an upgrade) refuses to start rather than run unprotected.
 */
function keepRequestsInCallerScope(client: PrismaClient, fallback: DbScope | undefined): void {
  const loader = requestLoaderOf(client);
  if (!loader) {
    throw new Error(
      'Prisma internals changed: cannot keep database requests in their scope (lib/prisma.ts).',
    );
  }
  const original = loader.options.batchBy.bind(loader.options);
  loader.options.batchBy = (request) => {
    if (request.transaction?.kind === 'batch') {
      if (currentDbScope() ?? fallback) {
        throw new Error(
          'Array transactions ($transaction([...])) are not scope-safe; use an interactive transaction.',
        );
      }
      return original(request);
    }
    return undefined;
  };
}

export type { PrismaClient };
