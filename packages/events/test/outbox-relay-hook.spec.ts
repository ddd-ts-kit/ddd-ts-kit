import { FixedClock } from '@ddd-ts-kit/kernel';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryOutboxStore, OutboxRelay } from '../src';
import { at } from './support/events';
import { eventually } from './support/eventually';
import { FlakyPublisher } from './support/flaky-publisher';
import { invoiceIssuedEvent as event } from './support/invoice-issued-event';
import { UnstableStore } from './support/unstable-store';

describe('OutboxRelay with an onFailure hook that throws', () => {
  const unhandled: unknown[] = [];
  const collect = (reason: unknown): void => void unhandled.push(reason);

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', collect);
  });

  afterEach(() => {
    process.off('unhandledRejection', collect);
  });

  function relayOver(store: InMemoryOutboxStore, publisher: FlakyPublisher, claimFailures = 0): OutboxRelay {
    return new OutboxRelay({
      store: new UnstableStore(store, claimFailures),
      publisher,
      clock: new FixedClock(at),
      onFailure: () => {
        throw new Error('logger not ready');
      },
    });
  }

  it('finishes the tick: the other records of the batch still go out', async () => {
    const store = new InMemoryOutboxStore();
    const publisher = new FlakyPublisher({ 'evt-1': 1 });

    await store.append([event('evt-1'), event('evt-2')]);

    expect(await relayOver(store, publisher).tick()).toEqual({ published: 1, failed: 1 });
    expect(publisher.delivered).toEqual(['evt-2']);
  });

  it('keeps a started relay running, with no rejection left unhandled', async () => {
    const store = new InMemoryOutboxStore();
    const publisher = new FlakyPublisher();
    const relay = relayOver(store, publisher, 2);

    await store.append([event('evt-1')]);

    relay.start({ intervalMs: 2 });
    await eventually(() => publisher.delivered.length === 1);
    await relay.stop();
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).toEqual([]);
  });
});
