import { describe, expect, it } from 'vitest';
import {
  InMemoryDomainEventDispatcher,
  InMemoryUnitOfWork,
  appendChanges,
  dispatchingOnSave,
  loadedAt,
  recordedEventsOf,
  unitOfWorkOver,
} from '../src';
import { Account } from './support/bank/account';
import { aBench } from './support/shop/a-bench';
import { Cart } from './support/shop/cart';
import { Shelf } from './support/shop/shelf';

const carrierDown = new Error('carrier down');

function aShelf(): { shelf: Shelf; dispatcher: InMemoryDomainEventDispatcher; heard: string[] } {
  const dispatcher = new InMemoryDomainEventDispatcher();
  const heard: string[] = [];

  dispatcher.on('shop.cart.opened', async (event) => void heard.push(event.name));
  dispatcher.on('shop.cart.added-book', async (event) => void heard.push(event.name));

  return { shelf: dispatchingOnSave(new Shelf(), () => dispatcher), dispatcher, heard };
}

const namesOf = (cart: Cart): string[] => recordedEventsOf(cart).map((event) => event.name);

describe('a unit of work that rolls back', () => {
  it('runs no handler of the earlier saves when a later save rejects', async () => {
    const { carts, dispatcher, heard, hear } = aBench();
    const second = Cart.open('c2');

    hear('shop.cart.opened');

    dispatcher.on('shop.cart.opened', async (event) => void heard.push(`after ${event.aggregateId}`), {
      phase: 'after-commit',
    });

    const failing = new InMemoryUnitOfWork().run(async () => {
      await carts.save(Cart.open('c1'));
      carts.failNextSave = new Error('duplicate key');
      await carts.save(second);
    });

    await expect(failing).rejects.toThrow('duplicate key');
    expect(heard).toEqual([]);
    expect(recordedEventsOf(second)).toHaveLength(1);
  });

  it('puts the aggregate it saved back as it found it: the same instance is saved again, and heard once', async () => {
    const { shelf, heard } = aShelf();
    const cart = Cart.open('c1');

    const failing = shelf.unitOfWork.run(async () => {
      await shelf.save(cart);

      throw carrierDown;
    });

    await expect(failing).rejects.toBe(carrierDown);
    expect([cart.version, namesOf(cart), shelf.versionOf('c1')]).toEqual([0, ['shop.cart.opened'], undefined]);

    await shelf.unitOfWork.run(() => shelf.save(cart));

    expect([cart.version, namesOf(cart), shelf.versionOf('c1')]).toEqual([1, [], 1]);
    expect(heard).toEqual(['shop.cart.opened']);
  });

  it('gives back the events of every save, ahead of what the aggregate recorded since, at the version it was loaded at', async () => {
    const { shelf } = aShelf();
    const cart = loadedAt(Cart.rehydrate('c1'), 0);

    await shelf.save(cart);
    cart.add('book');

    const failing = shelf.unitOfWork.run(async () => {
      await shelf.save(cart);
      cart.add('pen');
      await shelf.save(cart);
      cart.empty();

      throw carrierDown;
    });

    await expect(failing).rejects.toBe(carrierDown);
    expect(cart.version).toBe(1);
    expect(namesOf(cart)).toEqual(['shop.cart.added-book', 'shop.cart.added-pen', 'shop.cart.emptied']);
  });

  it('gives back what a before-commit handler that failed was handed, and what the handler itself saved', async () => {
    const { shelf, dispatcher } = aShelf();
    const cart = Cart.open('c1');
    const gift = Cart.open('c2');

    dispatcher.on('shop.cart.opened', async (event) => {
      if (event.aggregateId === 'c1') {
        await shelf.save(gift);

        throw carrierDown;
      }
    });

    await expect(shelf.unitOfWork.run(() => shelf.save(cart))).rejects.toBe(carrierDown);

    expect([cart.version, namesOf(cart)]).toEqual([0, ['shop.cart.opened']]);
    expect([gift.version, namesOf(gift)]).toEqual([0, ['shop.cart.opened']]);
  });

  it('gives back to an event-sourced aggregate the events its stream lost with the transaction', async () => {
    const account = Account.open('a1', 'Ada').deposit(5);
    const appended: number[] = [];

    const append = async ({ events }: { readonly events: readonly unknown[] }): Promise<void> => {
      appended.push(events.length);
    };

    const failing = unitOfWorkOver((work) => work()).run(async () => {
      await appendChanges(account, append);

      throw carrierDown;
    });

    await expect(failing).rejects.toBe(carrierDown);
    expect(account.version).toBe(0);

    await appendChanges(account, append);

    expect(appended).toEqual([2, 2]);
    expect(account.version).toBe(2);
  });

  it('leaves the aggregate as its save left it once the unit of work committed, and in a save made outside of any', async () => {
    const { shelf } = aShelf();
    const inside = Cart.open('c1');
    const outside = Cart.open('c2');

    await shelf.unitOfWork.run(() => shelf.save(inside));
    await shelf.save(outside);

    expect([inside.version, namesOf(inside), outside.version, namesOf(outside)]).toEqual([1, [], 1, []]);
  });

  it('gives nothing back where nothing is undone: a unit of work in memory leaves the aggregate in step with the fakes', async () => {
    const { shelf } = aShelf();
    const cart = Cart.open('c1');

    const failing = new InMemoryUnitOfWork().run(async () => {
      await shelf.save(cart);

      throw carrierDown;
    });

    await expect(failing).rejects.toBe(carrierDown);
    expect([cart.version, namesOf(cart), shelf.versionOf('c1')]).toEqual([1, [], 1]);
  });
});
