import type { IntegrationEventCallback } from '@ddd-ts-kit/kernel';

/**
 * The handlers of one consumer, by event type. A stream may carry several types
 * (`streamOf`): it is read as long as one of its types has a handler, and each entry goes to
 * the handlers of its own type.
 */
export class Subscriptions {
  private readonly handlers = new Map<string, Set<IntegrationEventCallback>>();

  constructor(private readonly streamOf: (type: string) => string) {}

  get isEmpty(): boolean {
    return this.types().length === 0;
  }

  /** The types that have a handler. */
  types(): string[] {
    return [...this.handlers].flatMap(([type, handlers]) => (handlers.size > 0 ? [type] : []));
  }

  /** The streams to read: those of the types that have a handler, each once. */
  streams(): string[] {
    return [...new Set(this.types().map(this.streamOf))];
  }

  /** Nothing for a type this consumer never subscribed to. */
  handlersOf(type: string): ReadonlySet<IntegrationEventCallback> | undefined {
    return this.handlers.get(type);
  }

  add(type: string, handler: IntegrationEventCallback): void {
    this.handlers.set(type, (this.handlers.get(type) ?? new Set()).add(handler));
  }

  // The type stays known: its group keeps accumulating, the consumer only stopped reading.
  remove(type: string, handler: IntegrationEventCallback): void {
    this.handlers.get(type)?.delete(handler);
  }
}
