import type { UnitOfWork } from '@ddd-ts-kit/kernel';
import type { ReadModelTableUnderContract } from './read-model-table-under-contract';

export interface ReadModelTableInUnitOfWork extends ReadModelTableUnderContract {
  /** The unit of work of its database: the swap of a rebuild runs in it. */
  readonly unitOfWork: UnitOfWork;
}
