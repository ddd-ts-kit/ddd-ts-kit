import { AggregateTracking } from '../../domain/aggregate-tracking';
import { notedAsFound } from './noted-as-found';
import type { DomainEvent } from '../../domain/domain-event';

/**
 * Hands over the events an aggregate recorded and leaves it with none. Called for the handlers by
 * the save of the repository (`dispatchingOnSave`); a use case and a repository adapter never
 * call it (`domain-events/dispatched-on-save`). Inside a unit of work they are noted as taken: a
 * rollback gives them back to the aggregate.
 */
export function takeRecordedEvents(aggregate: object): DomainEvent[] {
  const tracking = AggregateTracking.of(aggregate);
  const found = notedAsFound(tracking);
  const taken = tracking.recorded.splice(0);

  tracking.appended = 0;
  found?.taken.push(...taken);

  return taken;
}
