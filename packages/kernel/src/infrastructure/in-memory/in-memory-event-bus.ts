import type { IntegrationEventCallback } from '../../application/events/integration-event-callback';
import type { IntegrationEvent } from '../../application/events/integration-event';
import type { Subscription } from '../../application/events/subscription';
import type { IntegrationEventPublisher } from '../../application/ports/integration-event-publisher';
import type { IntegrationEventSubscriber } from '../../application/ports/integration-event-subscriber';

/**
 * Reference provider for IntegrationEvents, for tests, local dev and single-process apps.
 * Delivery is at-least-once-shaped: handlers are awaited in order, a failing handler
 * does not stop the others. `publish` then rejects with the failure of a single handler as it
 * is, so its class and its `code` (`CONCURRENCY_CONFLICT`, answered 409) reach the caller, and
 * with an `AggregateError` of several.
 */
export class InMemoryEventBus implements IntegrationEventPublisher, IntegrationEventSubscriber {
  /** Read by what observes the bus from outside: the name of the transport. */
  readonly messagingSystem = 'in-memory';

  readonly published: IntegrationEvent[] = [];

  private readonly handlers = new Map<string, Set<IntegrationEventCallback>>();

  async publish(events: readonly IntegrationEvent[]): Promise<void> {
    const failures: unknown[] = [];

    for (const event of events) {
      this.published.push(event);

      for (const handler of this.handlers.get(event.type) ?? []) {
        try {
          await handler(event, { attempt: 1, system: this.messagingSystem, destination: event.type });
        } catch (error) {
          failures.push(error);
        }
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }

    if (failures.length > 1) {
      throw new AggregateError(failures, `${failures.length} event handler(s) failed`);
    }
  }

  subscribe(type: string, handler: IntegrationEventCallback): Subscription {
    const set = this.handlers.get(type) ?? new Set();

    set.add(handler);
    this.handlers.set(type, set);

    return { unsubscribe: () => void set.delete(handler) };
  }
}
