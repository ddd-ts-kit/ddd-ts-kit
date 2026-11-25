/**
 * A command ran in a unit of work that opened no scope for the domain events: nothing would hold
 * them until the end of the work, and their `after-commit` handlers would run before the commit.
 */
export class UnscopedUnitOfWorkError extends Error {
  constructor() {
    super(
      'The unit of work given to unitOfWorkMiddleware opened no scope for the domain events. Build it on unitOfWorkOver of @ddd-ts-kit/kernel, around what begins and commits its transaction, or give InMemoryUnitOfWork where there is none.',
    );

    this.name = 'UnscopedUnitOfWorkError';
  }
}
