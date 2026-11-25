import { describe, expect, it } from 'vitest';
import { NamedDomainEvent, type Appliers, type DomainEvent } from '../src';

class InvoiceIssued extends NamedDomainEvent('billing.invoice.issued') {}

class InvoicePaid extends NamedDomainEvent('billing.invoice.paid') {
  constructor(
    invoiceId: string,
    occurredAt: Date,
    readonly cents: number,
  ) {
    super(invoiceId, occurredAt);
  }
}

describe('NamedDomainEvent', () => {
  const occurredAt = new Date('2026-01-01T00:00:00.000Z');

  it('gives the class and its events the name written once', () => {
    const event: DomainEvent = new InvoiceIssued('invoice-1', occurredAt);

    expect(InvoiceIssued.eventName).toBe('billing.invoice.issued');
    expect(event.name).toBe('billing.invoice.issued');
  });

  it('carries what every event says, and leaves an event its own facts', () => {
    const paid = new InvoicePaid('invoice-1', occurredAt, 1200);

    expect({ ...paid }).toEqual({
      name: 'billing.invoice.paid',
      aggregateId: 'invoice-1',
      occurredAt,
      cents: 1200,
    });
  });

  it('names the aggregate as text, whatever the type of its id', () => {
    expect(new InvoiceIssued(42, occurredAt).aggregateId).toBe('42');
  });

  it('keeps the name as an own property, so a copy of the event still has it', () => {
    expect({ ...new InvoiceIssued('invoice-1', occurredAt) }.name).toBe('billing.invoice.issued');
  });

  it('types the name with its literal, so the appliers of a union are asked for each event', () => {
    const appliers: Appliers<InvoiceIssued | InvoicePaid> = {
      [InvoiceIssued.eventName]: () => undefined,
      [InvoicePaid.eventName]: () => undefined,
    };

    expect(Object.keys(appliers)).toEqual(['billing.invoice.issued', 'billing.invoice.paid']);
  });
});
