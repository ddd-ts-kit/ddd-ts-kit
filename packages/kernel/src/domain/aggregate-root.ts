import { AggregateTracking } from './aggregate-tracking';
import type { DomainEvent } from './domain-event';
import { Entity } from './entity';

/**
 * Consistency boundary and transaction boundary. Only the root is reachable from
 * outside; state changes go through intention-revealing methods that guard the
 * invariants and record domain events.
 *
 * The model records and reads its version; it moves neither. The repository adapter says at
 * which version it loaded the aggregate (`loadedAt`), the save moves it (`optimisticUpdate`), and
 * the recorded events leave with the save (`dispatchingOnSave`).
 */
export abstract class AggregateRoot<Id extends string | number = string> extends Entity<Id> {
  protected constructor(id: Id) {
    super(id);
    AggregateTracking.start(this);
  }

  /** Optimistic concurrency token: the version the store holds of this aggregate, 0 until its first save. */
  get version(): number {
    return AggregateTracking.of(this).version;
  }

  protected record(event: DomainEvent): void {
    AggregateTracking.of(this).record(event);
  }
}
