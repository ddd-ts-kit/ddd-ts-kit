import { AggregateRoot, type DomainEvent } from '@ddd-ts-kit/kernel';
import { describe, expect, it } from 'vitest';
import { scenario } from '../src';
import { at } from './support/order';

describe('an event matched by the properties that matter', () => {
  interface Parcel {
    readonly carrier: string;
    readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  }

  class Shipment extends AggregateRoot {
    static prepared(id: string): Shipment {
      return new Shipment(id);
    }

    dispatch(parcels: readonly Parcel[]): void {
      const dispatched: DomainEvent & { readonly parcels: readonly Parcel[] } = {
        name: 'shipping.shipment.dispatched',
        aggregateId: this.id,
        occurredAt: at,
        parcels,
      };

      this.record(dispatched);
    }
  }

  const dispatching = () =>
    scenario(() => Shipment.prepared('shipment-1')).when((shipment) =>
      shipment.dispatch([
        { carrier: 'post', lines: [{ sku: 'pen', quantity: 2 }] },
        { carrier: 'bike', lines: [] },
      ]),
    );

  it('reads an object of a list as any other: by the properties named, position by position', () => {
    dispatching().thenEvents([{ parcels: [{ lines: [{ sku: 'pen' }] }, { carrier: 'bike' }] }]);
  });

  it('points at the property of the item that differs', () => {
    expect(() => dispatching().thenEvents([{ parcels: [{ lines: [{ sku: 'ink' }] }, {}] }])).toThrow(
      "  1. event 1.parcels[0].lines[0].sku: expected 'ink', recorded 'pen'",
    );
  });

  it('says when a list has not the expected number of items', () => {
    expect(() => dispatching().thenEvents([{ parcels: [{ carrier: 'post' }] }])).toThrow(
      "  1. event 1.parcels: expected 1 item, recorded 2 items: [ { carrier: 'post', lines: [ { quantity: 2, sku: 'pen' } ] }, { carrier: 'bike', lines: [] } ]",
    );
  });

  it('refuses a matcher that names no property, which any event would match', () => {
    expect(() => dispatching().thenEvents([{}])).toThrow(
      new TypeError(
        'An event matcher names at least one property: {} would match any event. Give the name or the class of the event to expect it whatever it carries.',
      ),
    );
  });
});
