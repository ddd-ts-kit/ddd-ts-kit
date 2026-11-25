import { AggregateTracking } from '../../domain/aggregate-tracking';
import { ConcurrencyError } from '../../domain/errors/concurrency-error';
import { UniqueViolationError } from '../../domain/errors/unique-violation-error';
import { storedAt } from '../../infrastructure/aggregates/stored-at';
import { unstoredEventsOf } from '../../infrastructure/aggregates/unstored-events-of';
import { isUniqueViolation } from '../../infrastructure/persistence/is-unique-violation';

export interface VersionStep {
  /** The version the row must still have: 0 means the aggregate was never saved. */
  readonly expected: number;
  /** The version to write: the rank of the last event the aggregate recorded, one more than `expected` when it recorded none. */
  readonly next: number;
}

/**
 * Optimistic concurrency on the `version` column of an aggregate table.
 *
 * `write` performs the guarded statement and returns the number of rows it wrote: an insert
 * ignoring the conflict on the key alone when `expected` is 0, otherwise an update
 * `WHERE id = ... AND version = expected`. No row written means somebody else got there
 * first: a ConcurrencyError is raised and the aggregate keeps its version. A statement the
 * database refuses for a value another row holds under a unique constraint (an email) raises a
 * UniqueViolationError (`CONFLICT`), the error of the driver as its cause: the same save would be
 * refused again. On success the aggregate carries the new version, so it can be saved again.
 * The version moves to the rank of the last event recorded since the row was read, and by one when
 * nothing was recorded: the next event of the aggregate then ranks after every one before it.
 * The aggregate is one of the kit, of whichever copy of the kernel: anything else is refused with
 * a `TypeError` before anything is written.
 */
export async function optimisticUpdate(
  aggregate: { readonly id: string | number; readonly version: number },
  write: (step: VersionStep) => Promise<number>,
): Promise<void> {
  const expected = AggregateTracking.of(aggregate).version;
  const recorded = unstoredEventsOf(aggregate).length;
  const next = expected + Math.max(recorded, 1);

  const written = await write({ expected, next }).catch((error: unknown) => {
    throw isUniqueViolation(error) ? new UniqueViolationError(aggregate.id, { cause: error }) : error;
  });

  if (written !== 1) {
    throw new ConcurrencyError(aggregate.id);
  }

  storedAt(aggregate, next, recorded);
}
