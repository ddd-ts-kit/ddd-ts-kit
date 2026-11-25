import type { UnitOfWork } from '../../application/ports/unit-of-work';
import { unitOfWorkOver } from '../domain-events/unit-of-work-over';

/**
 * No transaction to open: runs the work as is, and nothing is undone when it fails. The domain
 * events are dispatched at its end all the same. Real adapters wrap a DB transaction.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly unitOfWork = unitOfWorkOver((work) => work());

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.run(work);
  }
}
