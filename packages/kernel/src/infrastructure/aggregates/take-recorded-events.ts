import { AggregateTracking } from '../../domain/aggregate-tracking';
import type { DomainEvent } from '../../domain/domain-event';

/**
 * Hands over the events an aggregate recorded and leaves it with none. Called for the handlers by
 * the save of the repository (`dispatchingOnSave`); a use case and a repository adapter never
 * call it (`domain-events/dispatched-on-save`).
 */
export function takeRecordedEvents(aggregate: object): DomainEvent[] {
  const tracking = AggregateTracking.of(aggregate);

  tracking.appended = 0;

  return tracking.recorded.splice(0);
}
