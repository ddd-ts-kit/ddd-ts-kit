import { describe, expect, it } from 'vitest';
import { Command, InMemoryCommandBus, UnscopedUnitOfWorkError, unitOfWorkMiddleware } from '../src';
import { aBench } from './support/shop/a-bench';
import { Cart } from './support/shop/cart';
import { RecordingUnitOfWork } from './support/shop/recording-unit-of-work';

class OpenCart extends Command<undefined> {
  constructor(readonly id: string) {
    super();
  }
}

/** Two databases, each with its unit of work, noting their transactions in one journal. */
function twoDatabases() {
  const journal: string[] = [];
  const bench = aBench();

  bench.dispatcher.on('shop.cart.opened', async (event) => void journal.push(`handling ${event.aggregateId}`));

  return {
    ...bench,
    journal,
    billing: new RecordingUnitOfWork(journal),
    shipping: new RecordingUnitOfWork(journal),
  };
}

describe('the scope of the unit of work of two databases', () => {
  it('is its own for each: the inner one dispatches before its own commit, inside the other', async () => {
    const { billing, shipping, carts, dispatcher, journal } = twoDatabases();

    dispatcher.on('shop.cart.opened', async (event) => void journal.push(`committed ${event.aggregateId}`), {
      phase: 'after-commit',
    });

    await billing.run(async () => {
      await shipping.run(() => carts.save(Cart.open('c1')));
      await carts.save(Cart.open('c2'));
    });

    expect(journal).toEqual([
      'begin',
      'begin',
      'handling c1',
      'commit',
      'committed c1',
      'handling c2',
      'commit',
      'committed c2',
    ]);
  });

  it('is found again by a run of its unit of work made through the one of the other database', async () => {
    const { billing, shipping, carts, journal } = twoDatabases();

    await billing.run(() => shipping.run(() => billing.run(() => carts.save(Cart.open('c1')))));

    expect(journal).toEqual(['begin', 'begin', 'commit', 'handling c1', 'commit']);
  });
});

describe('unitOfWorkMiddleware and a unit of work that opens no scope', () => {
  it('refuses it before the handler runs', async () => {
    const handled: string[] = [];

    const bus = new InMemoryCommandBus()
      .use(unitOfWorkMiddleware({ run: (work) => work() }))
      .register(OpenCart, { execute: async ({ id }) => void handled.push(id) });

    await expect(bus.execute(new OpenCart('c1'))).rejects.toThrow(UnscopedUnitOfWorkError);
    expect(handled).toEqual([]);
  });

  it('refuses it for a command sent after the commit of another unit of work', async () => {
    const { billing, carts, dispatcher, journal } = twoDatabases();

    const bus = new InMemoryCommandBus()
      .use(unitOfWorkMiddleware({ run: (work) => work() }))
      .register(OpenCart, { execute: async ({ id }) => void journal.push(`opened ${id}`) });

    dispatcher.on(
      'shop.cart.opened',
      (event) =>
        bus.execute(new OpenCart(`after ${event.aggregateId}`)).catch((error: Error) => void journal.push(error.name)),
      { phase: 'after-commit' },
    );

    await billing.run(() => carts.save(Cart.open('c1')));

    expect(journal).toEqual(['begin', 'handling c1', 'commit', 'UnscopedUnitOfWorkError']);
  });
});
