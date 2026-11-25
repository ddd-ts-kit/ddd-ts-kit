import { unitOfWorkOver, type UnitOfWork } from '@ddd-ts-kit/kernel';

/** Stands for a database transaction: what was written inside `run` is kept only if it succeeds. */
export class StagingUnitOfWork implements UnitOfWork {
  private staged: (() => Promise<void>)[] | undefined;

  private readonly unitOfWork = unitOfWorkOver((work) => this.transaction(work));

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.run(work);
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    this.staged = [];

    try {
      const result = await work();

      for (const apply of this.staged) {
        await apply();
      }

      return result;
    } finally {
      this.staged = undefined;
    }
  }

  enlist(apply: () => Promise<void>): void {
    if (this.staged === undefined) {
      throw new Error('Written outside of a unit of work');
    }

    this.staged.push(apply);
  }
}
