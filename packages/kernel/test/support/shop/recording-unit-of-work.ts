import { unitOfWorkOver, type UnitOfWork } from '../../../src';

/**
 * A unit of work as a project writes its own, on `unitOfWorkOver`: its transaction notes itself
 * in the journal and nothing else. `failNextCommit` makes the next commit fail, as a deferred
 * constraint or a lost connection would.
 */
export class RecordingUnitOfWork implements UnitOfWork {
  failNextCommit: Error | undefined;

  private readonly unitOfWork = unitOfWorkOver((work) => this.transaction(work));

  constructor(private readonly journal: string[]) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.run(work);
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    this.journal.push('begin');

    try {
      const result = await work();

      this.commit();

      return result;
    } catch (error) {
      this.journal.push('rollback');

      throw error;
    }
  }

  private commit(): void {
    const failure = this.failNextCommit;

    this.failNextCommit = undefined;

    if (failure !== undefined) {
      throw failure;
    }

    this.journal.push('commit');
  }
}
