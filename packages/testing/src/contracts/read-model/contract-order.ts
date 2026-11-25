import { AggregateRoot, recordedEventsOf, stampOf, type DomainEvent, type EventStamp } from '@ddd-ts-kit/kernel';

/** A fact of the order of the contract, under the last word of its name. */
class OrderFact implements DomainEvent {
  readonly name: string;

  constructor(
    fact: string,
    readonly aggregateId: string,
    readonly occurredAt: Date,
  ) {
    this.name = `sales.order.${fact}`;
  }
}

/**
 * An aggregate of the contract that records several facts in one command, all at the same
 * instant: what orders them is their rank in the order, not a clock nor their names.
 */
export class ContractOrder extends AggregateRoot {
  private constructor(
    id: string,
    private readonly at: Date,
  ) {
    super(id);
  }

  /** An order placed, given two lines, then cancelled, at once. */
  static placedAndCancelledAt(id: string, at: Date): ContractOrder {
    const order = new ContractOrder(id, at);

    order.note('placed');
    order.note('line-added');
    order.note('line-added');
    order.note('cancelled');

    return order;
  }

  /** The stamp of each fact the order recorded, under the last word of its name, oldest first. */
  facts(): readonly (readonly [fact: string, stamp: EventStamp])[] {
    return recordedEventsOf(this).map((event) => [event.name.replace('sales.order.', ''), stampOf(event)]);
  }

  private note(fact: string): void {
    this.record(new OrderFact(fact, this.id, this.at));
  }
}
