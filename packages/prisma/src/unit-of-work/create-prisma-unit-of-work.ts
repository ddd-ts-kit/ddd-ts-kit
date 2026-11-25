import { AsyncLocalStorage } from 'node:async_hooks';
import { unitOfWorkOver, type UnitOfWork } from '@ddd-ts-kit/kernel';
import type { PrismaContext } from './prisma-context';
import type { PrismaTransactionHost } from './prisma-transaction-host';

/** One object for both ports: bind it to `UnitOfWork` and to the `PrismaContext` of the project. */
export interface PrismaUnitOfWork<Tx> extends UnitOfWork, PrismaContext<Tx> {}

/**
 * A unit of work over the interactive `$transaction` of Prisma. The transaction client travels
 * in an AsyncLocalStorage owned by this unit of work, so two clients never see each other's
 * transaction: a `run` called inside the unit of work of another client opens its own. A nested
 * `run` joins the outer transaction: it commits or rolls back as a whole. Domain events are
 * dispatched at the end of the outermost `run`, before its commit (`unitOfWorkOver`): their
 * handlers run inside the time Prisma allows the transaction.
 *
 * Prisma bounds an interactive transaction in time (`timeout`, 5 seconds by default) and
 * rolls it back beyond, and gives up a transaction that waited for a connection longer than
 * `maxWait` (2 seconds by default): pass `options` to widen them for long commands and bursts.
 * Either answers `P2028`, which the unit of work rejects as a `TransactionTimeoutError`.
 */
export function createPrismaUnitOfWork<Tx, Options>(
  // NoInfer: `Tx` is what `$transaction` hands out, and the root client must offer at least that.
  client: PrismaTransactionHost<Tx, Options> & NoInfer<Tx>,
  options?: Options,
): PrismaUnitOfWork<Tx> {
  const current = new AsyncLocalStorage<{ readonly transaction: Tx }>();

  const unitOfWork = unitOfWorkOver((work) =>
    client.$transaction((transaction) => current.run({ transaction }, work), options),
  );

  return {
    run: (work) => unitOfWork.run(work),
    client: () => current.getStore()?.transaction ?? client,
    inTransaction: () => current.getStore() !== undefined,
  };
}
