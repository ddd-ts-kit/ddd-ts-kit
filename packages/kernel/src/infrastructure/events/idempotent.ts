import type { IntegrationEventCallback } from '../../application/events/integration-event-callback';
import type { ProcessedEventStore } from '../../application/ports/processed-event-store';

/**
 * Wraps a handler so a redelivered event is processed once per consumer. A failed handler
 * gives its mark back, otherwise the redelivery would be skipped and the event lost.
 */
export function idempotent(
  consumer: string,
  store: ProcessedEventStore,
  handler: IntegrationEventCallback,
): IntegrationEventCallback {
  return async (event, delivery) => {
    if (!(await store.markProcessed(consumer, event.id))) {
      return;
    }

    try {
      await handler(event, delivery);
    } catch (failure) {
      // A store that cannot give the mark back keeps it: both failures are told, the one of the handler first.
      await store.release?.(consumer, event.id).catch((notReleased: unknown) => {
        throw new AggregateError([failure, notReleased], markKept(consumer, event.id), { cause: failure });
      });

      throw failure;
    }
  };
}

function markKept(consumer: string, eventId: string): string {
  return `The handler of ${consumer} failed on event ${eventId} and its mark could not be released: a redelivery will be skipped.`;
}
