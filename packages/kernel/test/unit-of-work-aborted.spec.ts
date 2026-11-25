import { describe, expect, it } from 'vitest';
import { UnitOfWorkAbortedError } from '../src';
import { aBench } from './support/shop/a-bench';
import { Cart } from './support/shop/cart';
import { RecordingUnitOfWork } from './support/shop/recording-unit-of-work';

class CarrierDown extends Error {}

/** A unit of work that notes its transaction, and a step that saves a cart then fails. */
function aShop() {
  const journal: string[] = [];
  const bench = aBench();
  const unitOfWork = new RecordingUnitOfWork(journal);

  bench.dispatcher.on('shop.cart.opened', async (event) => void journal.push(`handling ${event.aggregateId}`));

  const failingAfter = (id: string) => async (): Promise<void> => {
    await bench.carts.save(Cart.open(id));
    throw new CarrierDown();
  };

  return { ...bench, journal, unitOfWork, failingAfter };
}

describe('a unit of work whose nested run failed', () => {
  it('refuses to commit when the work caught the failure, and hands no event over', async () => {
    const { unitOfWork, failingAfter, journal } = aShop();

    const failure = await unitOfWork
      .run(() => unitOfWork.run(failingAfter('c1')).catch(() => undefined))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnitOfWorkAbortedError);
    expect(failure).toMatchObject({ cause: expect.any(CarrierDown) });
    expect(journal).toEqual(['begin', 'rollback']);
  });

  it('rejects with the failure itself when it travelled up', async () => {
    const { unitOfWork, failingAfter, journal } = aShop();

    await expect(unitOfWork.run(() => unitOfWork.run(failingAfter('c1')))).rejects.toBeInstanceOf(CarrierDown);
    expect(journal).toEqual(['begin', 'rollback']);
  });

  it('refuses to commit although a second try of the nested run succeeded', async () => {
    const { unitOfWork, failingAfter, carts, journal } = aShop();

    const retried = unitOfWork.run(async () => {
      await unitOfWork.run(failingAfter('c1')).catch(() => unitOfWork.run(() => carts.save(Cart.open('c2'))));
    });

    await expect(retried).rejects.toBeInstanceOf(UnitOfWorkAbortedError);
    expect(journal).toEqual(['begin', 'rollback']);
  });

  it('refuses to commit when a before-commit handler caught the failure of the run it made', async () => {
    const { unitOfWork, failingAfter, carts, dispatcher, journal } = aShop();

    dispatcher.on('shop.cart.opened', async (event) => {
      if (event.aggregateId === 'c1') {
        await unitOfWork.run(failingAfter('c2')).catch(() => undefined);
      }
    });

    await expect(unitOfWork.run(() => carts.save(Cart.open('c1')))).rejects.toBeInstanceOf(UnitOfWorkAbortedError);
    expect(journal).toEqual(['begin', 'handling c1', 'handling c2', 'rollback']);
  });

  it('commits when the run that failed was the unit of work of another database, rolled back on its own', async () => {
    const { unitOfWork, failingAfter, carts, journal } = aShop();
    const shipping = new RecordingUnitOfWork(journal);

    await unitOfWork.run(async () => {
      await shipping.run(failingAfter('c1')).catch(() => undefined);
      await carts.save(Cart.open('c2'));
    });

    expect(journal).toEqual(['begin', 'begin', 'rollback', 'handling c2', 'commit']);
  });

  it('refuses to commit when the run that joined it failed inside the unit of work of another database', async () => {
    const { unitOfWork, failingAfter, journal } = aShop();
    const shipping = new RecordingUnitOfWork(journal);

    const failure = unitOfWork.run(() => shipping.run(() => unitOfWork.run(failingAfter('c1')).catch(() => undefined)));

    await expect(failure).rejects.toBeInstanceOf(UnitOfWorkAbortedError);
    expect(journal).toEqual(['begin', 'begin', 'commit', 'rollback']);
  });
});
