import { recordedEventsOf, type DomainEvent } from '@ddd-ts-kit/kernel';
import type { EventSource } from './event-source';

/**
 * The events an aggregate recorded and has yet to announce, oldest first, for a spec that asserts
 * them with the tools of its runner: `expect(recordedBy(order)).toEqual([new OrderPlaced(...)])`.
 * Reading leaves them on the aggregate; `given(...).when(...)` asserts the events of one intention.
 */
export function recordedBy(aggregate: EventSource): readonly DomainEvent[] {
  return recordedEventsOf(aggregate);
}
