import { describe, expect, it, vi } from 'vitest';
import {
  AggregateRoot,
  InMemoryDomainEventDispatcher,
  aggregateMapper,
  appendChanges,
  dispatchingOnSave,
  loadedAt,
  optimisticUpdate,
  recordedEventsOf,
  takeRecordedEvents,
  type DomainEvent,
} from '../src';
import { Account } from './support/bank/account';
import { Cart } from './support/shop/cart';

describe('what an aggregate shows of its version and of its events', () => {
  it('reads its version and cannot write it', () => {
    const cart = Cart.open('c1');

    expect(cart.version).toBe(0);

    expect(() => {
      // @ts-expect-error -- the version is read-only for the model: the repository adapter says it with loadedAt
      cart.version = 42;
    }).toThrow(TypeError);

    expect(cart.version).toBe(0);
  });

  it('hands nothing over by itself: no method of the aggregate reads or clears what it recorded', () => {
    const cart = Cart.open('c1');

    expect('pullEvents' in cart).toBe(false);
    expect(Object.keys(cart)).toEqual(['id']);
  });
});

describe('what the infrastructure reads and moves of an aggregate', () => {
  it('says at which version an aggregate was loaded, and answers the aggregate', () => {
    const cart = Cart.rehydrate('c1');

    expect(loadedAt(cart, 7)).toBe(cart);
    expect(cart.version).toBe(7);
  });

  it('maps a row to the aggregate loaded at the version of that row: the mapper declares the state, never the version', () => {
    const CartMapper = aggregateMapper({
      toDomain: (row: { readonly id: string; readonly version: number }) => Cart.rehydrate(row.id),
      toRow: (cart: Cart) => ({ id: cart.id }),
    });

    const cart = CartMapper.toDomain({ id: 'c1', version: 5 });

    expect([cart.id, cart.version]).toEqual(['c1', 5]);
    expect(CartMapper.toRow(cart)).toEqual({ id: 'c1' });
  });

  it('reads the recorded events and leaves them on the aggregate', () => {
    const cart = Cart.open('c1');

    cart.add('book');

    const read = recordedEventsOf(cart).map((event) => event.name);

    expect(read).toEqual(['shop.cart.opened', 'shop.cart.added-book']);
    expect(recordedEventsOf(cart)).toHaveLength(2);
  });

  it('takes the recorded events once: the aggregate is left with none', () => {
    const cart = Cart.open('c1');

    expect(takeRecordedEvents(cart)).toHaveLength(1);
    expect(recordedEventsOf(cart)).toEqual([]);
  });

  it('appends what an event-sourced aggregate recorded once, whether its events were taken meanwhile or not', async () => {
    const account = Account.open('a1', 'Ada');
    const appended: number[] = [];

    const append = async ({ events }: { readonly events: readonly DomainEvent[] }): Promise<void> => {
      appended.push(events.length);
    };

    await appendChanges(account, append);
    account.deposit(5);
    await appendChanges(account, append);
    takeRecordedEvents(account);
    account.deposit(7).deposit(9);
    await appendChanges(account, append);

    expect(appended).toEqual([1, 1, 2]);
    expect(account.version).toBe(4);
  });
});

describe('an aggregate of another copy of the kernel', () => {
  it('is loaded, saved and followed like one of this copy', async () => {
    vi.resetModules();

    const other = await import('../src');

    class Parcel extends other.AggregateRoot {
      constructor(id: string) {
        super(id);
        this.record({ name: 'shipping.parcel.registered', aggregateId: id, occurredAt: new Date(0) });
      }
    }

    const heard: string[] = [];
    const dispatcher = new InMemoryDomainEventDispatcher();

    const parcels = dispatchingOnSave(
      { save: (parcel: Parcel) => optimisticUpdate(parcel, async () => 1) },
      () => dispatcher,
    );

    dispatcher.on('shipping.parcel.registered', async (event) => void heard.push(event.aggregateId));

    const parcel = loadedAt(new Parcel('p1'), 3);

    expect(parcel).not.toBeInstanceOf(AggregateRoot);
    expect(recordedEventsOf(parcel)).toHaveLength(1);

    await parcels.save(parcel);

    expect(parcel.version).toBe(4);
    expect(heard).toEqual(['p1']);
  });
});

describe('what is no aggregate', () => {
  const impostor = { id: 'invoice-1', version: 3 };
  const refusal = 'Object is no aggregate: it extends no AggregateRoot, so nothing keeps its version nor its events';

  it('is refused by a save before anything is written, instead of being stored as nothing', async () => {
    const written: number[] = [];
    const write = async (): Promise<number> => written.push(1);

    await expect(optimisticUpdate(impostor, write)).rejects.toThrow(new TypeError(refusal));
    expect(written).toEqual([]);
  });

  it('is refused by every function that reads or moves an aggregate', () => {
    expect(() => loadedAt(impostor, 4)).toThrow(refusal);
    expect(() => recordedEventsOf(impostor)).toThrow(refusal);
    expect(() => takeRecordedEvents(impostor)).toThrow(refusal);
  });
});
