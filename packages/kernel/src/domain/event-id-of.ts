import type { DomainEvent } from './domain-event';
import { rankOf } from './rank-of';

/**
 * The identity of a domain event: its name, which says the context and the aggregate, the id of
 * its aggregate and its rank there, `billing.invoice.issued:inv-1:3`. Nothing is drawn: the event
 * dispatched by a save and the same event read back from its stream have one identity.
 */
export function eventIdOf(event: DomainEvent): string {
  return `${event.name}:${event.aggregateId}:${String(rankOf(event))}`;
}
