import type { UnitOfWork } from '../../application/ports/unit-of-work';
import { unitOfWorkOver } from '../domain-events/unit-of-work-over';

/**
 * No transaction to open: runs the work as is. When it fails, the stores in memory undo what it
 * wrote (`onRollback`, a `RollbackMap`) and the aggregates it saved are given back, as a real
 * adapter rolls back. The domain events are dispatched at the end of the work, as there. There is
 * no isolation: what a run writes is seen at once. Real adapters wrap a DB transaction.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly unitOfWork = unitOfWorkOver((work) => work());

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.run(work);
  }
}
