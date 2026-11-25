import { AggregateTracking } from '../../domain/aggregate-tracking';
import type { DomainEvent } from '../../domain/domain-event';

/** The events an aggregate recorded that no save wrote yet, oldest first: what its next save stores, or counts its version by. */
export function unstoredEventsOf(aggregate: object): readonly DomainEvent[] {
  const { recorded, appended } = AggregateTracking.of(aggregate);

  return recorded.slice(appended);
}
