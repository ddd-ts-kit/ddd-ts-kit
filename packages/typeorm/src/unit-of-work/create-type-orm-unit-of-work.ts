import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource, EntityManager } from 'typeorm';
import { unitOfWorkOver, type UnitOfWork } from '@ddd-ts-kit/kernel';
import type { TypeOrmContext } from './type-orm-context';

/** The isolation levels TypeORM accepts, restated so the signature reads without a deep import. */
export type TypeOrmIsolationLevel = Parameters<DataSource['transaction']>[0];

/** One object for both ports: bind it to `UnitOfWork` and to `TypeOrmContext`. */
export interface TypeOrmUnitOfWork extends UnitOfWork, TypeOrmContext {}

/**
 * A unit of work over `dataSource.transaction`. The transactional manager travels in an
 * AsyncLocalStorage owned by this unit of work, so two data sources never see each other's
 * transaction: a `run` called inside the unit of work of another data source opens its own. A
 * nested `run` joins the outer transaction: it commits or rolls back as a whole. Domain events
 * are dispatched at the end of the outermost `run`, before its commit (`unitOfWorkOver`).
 */
export function createTypeOrmUnitOfWork(
  dataSource: DataSource,
  isolationLevel?: TypeOrmIsolationLevel,
): TypeOrmUnitOfWork {
  const current = new AsyncLocalStorage<EntityManager>();

  const unitOfWork = unitOfWorkOver(<T>(work: () => Promise<T>) => {
    const inTransaction = (manager: EntityManager): Promise<T> => current.run(manager, work);

    return isolationLevel === undefined
      ? dataSource.transaction(inTransaction)
      : dataSource.transaction(isolationLevel, inTransaction);
  });

  return {
    run: (work) => unitOfWork.run(work),
    manager: () => current.getStore() ?? dataSource.manager,
    inTransaction: () => current.getStore() !== undefined,
  };
}
