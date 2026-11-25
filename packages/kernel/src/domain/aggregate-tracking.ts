import type { DomainEvent } from './domain-event';

// Shared across the copies of the kernel a process loads: an aggregate of a context compiled apart is tracked the same.
const TRACKING = Symbol.for('@ddd-ts-kit/kernel/aggregate-tracking/v1');

/**
 * What an aggregate carries for the infrastructure and never shows to its model: the version its
 * store holds of it and the events it has yet to announce. The aggregate records; the functions of
 * the infrastructure (`loadedAt`, `optimisticUpdate`, `appendChanges`, `takeRecordedEvents`) move
 * the rest.
 */
export class AggregateTracking {
  /** The version the store holds: 0 until the first save. */
  version = 0;

  /** Recorded and not announced yet, oldest first. */
  readonly recorded: DomainEvent[] = [];

  /** How many of the recorded events, from the oldest, the stream of an event-sourced aggregate already holds. */
  appended = 0;

  /**
   * Starts tracking an aggregate, out of enumeration: comparing, spreading or serialising it never
   * sees a version nor what it has yet to announce.
   */
  static start(aggregate: object): void {
    Object.defineProperty(aggregate, TRACKING, { value: new AggregateTracking() });
  }

  /** The tracking of an aggregate, whichever copy of the kernel built it; anything else is refused. */
  static of(aggregate: object): AggregateTracking {
    const tracking: unknown = Reflect.get(aggregate, TRACKING);

    if (!isTracking(tracking)) {
      throw new TypeError(
        `${aggregate.constructor.name} is no aggregate: it extends no AggregateRoot, so nothing keeps its version nor its events`,
      );
    }

    return tracking;
  }

  static follows(value: unknown): value is object {
    return typeof value === 'object' && value !== null && isTracking(Reflect.get(value, TRACKING));
  }
}

/** Read by its shape: the tracking another copy of the kernel started is no instance of this class. */
function isTracking(value: unknown): value is AggregateTracking {
  return typeof value === 'object' && value !== null && 'version' in value && 'recorded' in value;
}
