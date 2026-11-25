import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExtractTablesWithRelations, TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction, PgTransactionConfig } from 'drizzle-orm/pg-core';
import { unitOfWorkOver, type UnitOfWork } from '@ddd-ts-kit/kernel';
import type { SqlExecutor } from '../tenancy/sql-executor';
import type { DrizzleContext } from './drizzle-context';

/** One object for both ports: bind it to `UnitOfWork` and to the `DrizzleContext` of the project. */
export interface DrizzleUnitOfWork<
  Q extends PgQueryResultHKT,
  F extends Record<string, unknown> = Record<string, never>,
  S extends TablesRelationalConfig = ExtractTablesWithRelations<F>,
> extends UnitOfWork,
    DrizzleContext<Q, F, S> {}

export interface DrizzleUnitOfWorkOptions {
  /** Runs first in each outermost transaction, before the work: `tenantSession(scope)` sets the tenant settings row-level security reads. */
  readonly begin?: (transaction: SqlExecutor) => Promise<void>;
}

/**
 * A unit of work over `db.transaction`, for any drizzle PostgreSQL driver (node-postgres,
 * postgres-js, PGlite, Neon...). The transaction travels in an AsyncLocalStorage owned by this
 * unit of work, so two databases never see each other's transaction: a `run` called inside the
 * unit of work of another database opens its own. A nested `run` joins the outer transaction: it
 * commits or rolls back as a whole. Domain events are dispatched at the end of the outermost
 * `run`, before its commit (`unitOfWorkOver`).
 */
export function createDrizzleUnitOfWork<
  Q extends PgQueryResultHKT,
  F extends Record<string, unknown>,
  S extends TablesRelationalConfig,
>(
  db: PgDatabase<Q, F, S>,
  config?: PgTransactionConfig,
  options: DrizzleUnitOfWorkOptions = {},
): DrizzleUnitOfWork<Q, F, S> {
  const current = new AsyncLocalStorage<PgTransaction<Q, F, S>>();
  const { begin } = options;

  const opened = async <T>(transaction: PgTransaction<Q, F, S>, work: () => Promise<T>): Promise<T> => {
    await begin?.(transaction);

    return work();
  };

  const unitOfWork = unitOfWorkOver((work) =>
    db.transaction((transaction) => current.run(transaction, () => opened(transaction, work)), config),
  );

  return {
    run: (work) => unitOfWork.run(work),
    executor: () => current.getStore() ?? db,
    inTransaction: () => current.getStore() !== undefined,
  };
}
