import { AggregateTracking } from '../../domain/aggregate-tracking';
import type { DomainEvent } from '../../domain/domain-event';

/** The events an aggregate recorded and has yet to announce, oldest first: read, and left on the aggregate. */
export function recordedEventsOf(aggregate: object): readonly DomainEvent[] {
  return [...AggregateTracking.of(aggregate).recorded];
}
