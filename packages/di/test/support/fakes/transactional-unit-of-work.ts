import { unitOfWorkOver, type UnitOfWork } from '@ddd-ts-kit/kernel';

/** What takes part in a transaction of the fake unit of work. */
export interface Transactional {
  begin(): void;
  commit(): void;
  rollBack(): void;
}

/**
 * A unit of work as a database gives one: what its participants wrote is kept when the work
 * ends and forgotten when it throws. A run inside a run joins it, as a nested transaction does.
 */
export class TransactionalUnitOfWork implements UnitOfWork {
  /** What became of each transaction, in order. */
  readonly outcomes: ('committed' | 'rolled back')[] = [];

  private readonly unitOfWork = unitOfWorkOver((work) => this.transaction(work));

  constructor(
    private readonly participants: readonly Transactional[],
    private readonly whenBegun: () => void = () => {},
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.run(work);
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    this.begin();

    try {
      const result = await work();

      this.end('committed');

      return result;
    } catch (error) {
      this.end('rolled back');

      throw error;
    }
  }

  private begin(): void {
    for (const participant of this.participants) {
      participant.begin();
    }

    this.whenBegun();
  }

  private end(outcome: 'committed' | 'rolled back'): void {
    for (const participant of this.participants) {
      if (outcome === 'committed') {
        participant.commit();
      } else {
        participant.rollBack();
      }
    }

    this.outcomes.push(outcome);
  }
}
