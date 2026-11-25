import type { DomainEvent } from './domain-event';
import { EVENT_RANK } from './event-rank';

/**
 * The rank of a domain event in the history of its aggregate, from 1: the events of one aggregate
 * are ordered by it, whatever the clocks say. For an event-sourced aggregate it is the version of
 * the event in its stream. An event no aggregate recorded has none, and is refused.
 */
export function rankOf(event: DomainEvent): number {
  const rank: unknown = Reflect.get(event, EVENT_RANK);

  if (typeof rank !== 'number') {
    throw new TypeError(
      `"${event.name}" of ${event.aggregateId} has no rank: no aggregate recorded it. Let the aggregate record it, or say where it stands with ranked(event, rank)`,
    );
  }

  return rank;
}
