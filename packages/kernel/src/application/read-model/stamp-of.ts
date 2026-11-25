import type { DomainEvent } from '../../domain/domain-event';
import { eventIdOf } from '../../domain/event-id-of';
import { rankOf } from '../../domain/rank-of';
import type { IntegrationEvent } from '../events/integration-event';
import type { EventStamp } from './event-stamp';

/**
 * The stamp of an event, for the row it changes.
 *
 * A domain event gives its identity, its instant and, as `version`, its rank in its aggregate: the
 * rows of one aggregate are ordered by its history and not by clocks, whether the event comes from
 * a save or from its stream. A key that the events of several aggregates write has no single
 * history: stamp it `{ eventId: eventIdOf(event), occurredAt: event.occurredAt }`, and the instants decide.
 *
 * An integration event gives its id and its instant; pass the per-key `version` when its payload
 * carries one, and the order no longer relies on clocks either.
 */
export function stampOf(event: DomainEvent): EventStamp;
export function stampOf(event: IntegrationEvent, version?: number): EventStamp;

export function stampOf(event: IntegrationEvent | DomainEvent, version?: number): EventStamp {
  if (isDomainEvent(event)) {
    return { eventId: eventIdOf(event), occurredAt: event.occurredAt, version: rankOf(event) };
  }

  const stamp = { eventId: event.id, occurredAt: new Date(event.occurredAt) };

  return version === undefined ? stamp : { ...stamp, version };
}

/** An integration event writes its instant as text, a domain event keeps a `Date`. */
function isDomainEvent(event: IntegrationEvent | DomainEvent): event is DomainEvent {
  return typeof event.occurredAt !== 'string';
}
