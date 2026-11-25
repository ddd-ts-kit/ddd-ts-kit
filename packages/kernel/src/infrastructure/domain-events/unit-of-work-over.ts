import { AsyncLocalStorage } from 'node:async_hooks';
import type { UnitOfWork } from '../../application/ports/unit-of-work';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict-error';
import { isTransactionConflict } from '../persistence/is-transaction-conflict';
import { isTransactionTimeout } from '../persistence/is-transaction-timeout';
import { TransactionTimeoutError } from '../persistence/transaction-timeout-error';
import { dispatchAfterCommit } from './dispatch-after-commit';
import { dispatchBeforeCommit } from './dispatch-before-commit';
import type { CommitStep } from './commit-step';
import { unitOfWorkScope, type UnitOfWorkScope } from './unit-of-work-scope';

/** Runs what it is given atomically: it begins, calls it, and commits when it resolved or rolls back when it rejected. */
type Transaction = <T>(work: () => Promise<T>) => Promise<T>;

/**
 * What every `UnitOfWork` is made of: the unit of work over the transactions of one database.
 *
 * The domain events of the aggregates saved by the work of a `run` wait in the scope of this
 * unit of work, in recording order across the saves. Once the work has returned they are
 * dispatched, still inside `transaction`: the handlers see every save, and what they save or
 * append to the outbox commits with the rest. A handler that fails, like the work that fails,
 * rejects the whole: the transaction rolls back, the waiting events are dropped and never come
 * back on the aggregates. The steps handed to `atCommit` are applied last, still inside
 * `transaction`; when it rejects, those applied are undone. Once `transaction` has resolved, and
 * only then, the `after-commit` handlers run, then the work handed to `afterCommit`.
 *
 * A deadlock or a serialization failure the database raised anywhere in the transaction, on the
 * statement it chose, rejects the outermost `run` as a `TransactionConflictError`, a
 * `ConcurrencyError` whose `cause` is the error of the driver: the caller runs it again. A
 * transaction its ORM could not start in time, the pool being busy, or ended for running too
 * long rejects it as a `TransactionTimeoutError` (`SERVICE_UNAVAILABLE`), the same way.
 *
 * `transaction` is called to open one, never to join: a `run` called while a transaction of
 * this unit of work is open on the asynchronous call chain joins it, its work and nothing else,
 * so one dispatch, at the end of the outermost. A unit of work over another database is another
 * one, wherever it is called from: its own transaction, and its own events dispatched before its
 * own commit. Two concurrent calls never share a scope.
 */
export function unitOfWorkOver(transaction: Transaction): UnitOfWork {
  // The scope of the transaction of this unit of work open on the asynchronous call chain.
  const open = new AsyncLocalStorage<UnitOfWorkScope>();

  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      const joined = open.getStore();

      if (isRunning(joined)) {
        return unitOfWorkScope.run(joined, work);
      }

      const scope = openScope();

      return opened(work, scope, (scoped) =>
        open.run(scope, () => unitOfWorkScope.run(scope, () => transaction(scoped))),
      );
    },
  };
}

/** The outermost run: the work, the dispatch and the commit steps inside `transaction`, the rest once it resolved. */
async function opened<T>(
  work: () => Promise<T>,
  scope: UnitOfWorkScope,
  transaction: (work: () => Promise<T>) => Promise<T>,
): Promise<T> {
  const applied: CommitStep[] = [];

  const result = await transaction(() => thenDispatched(work, scope, applied))
    .catch(async (error: unknown) => {
      await undone(applied);
      throw translated(error);
    })
    .finally(() => {
      scope.stage = 'closed';
      scope.queue.length = 0;
    });

  await afterTheCommit(scope);

  return result;
}

/** What the database said of the transaction, in the words of the kernel; any other failure as it is. */
function translated(error: unknown): unknown {
  if (isTransactionConflict(error)) {
    return new TransactionConflictError(error);
  }

  return isTransactionTimeout(error) ? new TransactionTimeoutError(error) : error;
}

function isRunning(scope: UnitOfWorkScope | undefined): scope is UnitOfWorkScope {
  return scope?.kind === 'unit-of-work' && (scope.stage === 'open' || scope.stage === 'before-commit');
}

function openScope(): UnitOfWorkScope {
  return { kind: 'unit-of-work', stage: 'open', queue: [], dispatched: [], committed: [], atCommit: [] };
}

async function thenDispatched<T>(work: () => Promise<T>, scope: UnitOfWorkScope, applied: CommitStep[]): Promise<T> {
  const result = await work();

  await dispatchBeforeCommit(scope);

  for (const step of scope.atCommit ?? []) {
    await step.apply();
    applied.push(step);
  }

  return result;
}

/** Newest first; an undo that fails reported itself, and the others still run. */
async function undone(applied: readonly CommitStep[]): Promise<void> {
  for (const step of [...applied].reverse()) {
    await step.undo().catch(() => undefined);
  }
}

/** The `after-commit` handlers, then the work handed to `afterCommit`; a rejection is dropped, the work reported its own. */
async function afterTheCommit(scope: UnitOfWorkScope): Promise<void> {
  await dispatchAfterCommit(scope);

  for (const work of scope.committed ?? []) {
    await work().catch(() => undefined);
  }
}
