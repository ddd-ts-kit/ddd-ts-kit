import { AggregateTracking } from '../../domain/aggregate-tracking';
import type { DomainEvent } from '../../domain/domain-event';

/** The events an event-sourced aggregate recorded that its stream does not hold yet, oldest first. */
export function unstoredEventsOf(aggregate: object): readonly DomainEvent[] {
  const { recorded, appended } = AggregateTracking.of(aggregate);

  return recorded.slice(appended);
}
