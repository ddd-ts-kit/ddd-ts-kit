import type { DomainEvent } from '../../domain/domain-event';
import type { EventSourcedAggregate } from '../../domain/event-sourcing/event-sourced-aggregate';
import { storedAt } from '../../infrastructure/aggregates/stored-at';
import { unstoredEventsOf } from '../../infrastructure/aggregates/unstored-events-of';

export interface StreamChanges {
  /** The version the stream must still have. */
  readonly expected: number;
  /** What the aggregate recorded since it was loaded, in order. */
  readonly events: readonly DomainEvent[];
}

/**
 * Optimistic concurrency for an event-sourced aggregate: hands what it recorded since it was
 * loaded to `append`, with the version its stream must still have. Once `append` resolves, the
 * aggregate is at the new version with nothing left to store, and can be saved again; when it
 * rejects (a ConcurrencyError: somebody else appended first), the aggregate is left as it was.
 * An aggregate that recorded nothing still hands its version over, with no event: the store
 * refuses it when the stream moved meanwhile, so a stale copy is never taken for a current one.
 * What is no aggregate of the kit, of whichever copy of the kernel, is refused with a `TypeError`.
 */
export async function appendChanges<E extends DomainEvent, S>(
  aggregate: EventSourcedAggregate<E, S>,
  append: (changes: StreamChanges) => Promise<void>,
): Promise<void> {
  const expected = aggregate.version;
  const events = unstoredEventsOf(aggregate);

  await append({ expected, events });
  storedAt(aggregate, expected + events.length, events.length);
}
