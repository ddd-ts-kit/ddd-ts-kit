/**
 * A fact that happened inside one bounded context, named in the past tense.
 * Never leaves the context as is: publish an IntegrationEvent instead.
 *
 * The aggregate that records it gives it its rank in its history (`rankOf`), and its identity
 * follows from both (`eventIdOf`): the event itself says neither.
 */
export interface DomainEvent {
  /** Stable name, `<context>.<aggregate>.<fact>`, e.g. `billing.invoice.issued`. */
  readonly name: string;
  readonly occurredAt: Date;
  /** The id of its aggregate, as text whatever the type of that id: a stream, a stamp and a store name the aggregate by it. */
  readonly aggregateId: string;
}

export { NamedDomainEvent } from './named-domain-event';
