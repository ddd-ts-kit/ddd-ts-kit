import type { DomainEvent } from './domain-event';
import { EVENT_RANK } from './event-rank';

/**
 * Gives a domain event its rank in the history of its aggregate, from 1, and answers the event.
 * The aggregate does it when it records the event, and the event serializer when it reads one back
 * from its stream, at the same rank; a test that builds an event by hand says with it where the
 * fact stands: `ranked(new InvoiceIssued('inv-1', now), 1)`. A rank is given once, since a fact
 * does not move: giving the same one again changes nothing, another one is refused.
 */
export function ranked<E extends DomainEvent>(event: E, rank: number): E {
  const held: unknown = Reflect.get(event, EVENT_RANK);

  if (typeof held === 'number' && held !== rank) {
    throw new TypeError(
      `"${event.name}" already stands at rank ${String(held)} of ${event.aggregateId}: a fact is recorded once, build another event`,
    );
  }

  if (held === undefined) {
    Object.defineProperty(event, EVENT_RANK, { value: rank });
  }

  return event;
}
