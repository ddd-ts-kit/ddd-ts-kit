/**
 * A `run` that joined the unit of work failed, and its failure did not reach the outermost one:
 * the work caught it and went on. What that run wrote before it failed is in the transaction, so
 * committing would keep a part of it: the unit of work rolls back as a whole instead. The
 * failure of the joined run is the `cause`.
 */
export class UnitOfWorkAbortedError extends Error {
  constructor(cause: unknown) {
    super(
      'A run that joined this unit of work failed and its failure was caught: nothing of the unit of work is committed. Let the failure reach the outermost run, or decide before the write instead of catching after it.',
      { cause },
    );

    this.name = 'UnitOfWorkAbortedError';
  }
}
