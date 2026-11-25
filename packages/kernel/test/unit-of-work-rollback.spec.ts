import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork, recordedEventsOf } from '../src';
import { aBench } from './support/shop/a-bench';
import { Cart } from './support/shop/cart';

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
});
