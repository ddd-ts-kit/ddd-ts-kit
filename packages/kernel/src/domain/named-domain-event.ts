/**
 * The base class of a domain event, which gives it its name once and carries what every event
 * says: `class InvoiceIssued extends NamedDomainEvent('billing.invoice.issued') {}` is built with
 * `new InvoiceIssued(invoice.id, clock.now())`. The class carries the name as
 * `InvoiceIssued.eventName`, what handlers and projections are attached under, and every event as
 * `name`, both typed with the literal. An event that says more declares a constructor with its
 * facts and hands the first two to `super`.
 *
 * The id of the aggregate is kept as text, here and nowhere else: an aggregate keyed by a number
 * hands its id as it is.
 */
export function NamedDomainEvent<const Name extends string>(eventName: Name) {
  abstract class Named {
    static readonly eventName: Name = eventName;

    readonly name: Name = eventName;

    readonly aggregateId: string;

    constructor(
      aggregateId: string | number,
      readonly occurredAt: Date,
    ) {
      this.aggregateId = String(aggregateId);
    }
  }

  return Named;
}
