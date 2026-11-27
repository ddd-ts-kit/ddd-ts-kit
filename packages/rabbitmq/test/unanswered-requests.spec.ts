import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RabbitMqFailure } from '../src';
import { Broker } from './support/broker';
import { PLACED, anEvent } from './support/events';
import { failuresOf } from './support/hooks';
import { recorder } from './support/recorder';
import { unique } from './support/unique';
import { eventually, pause } from './support/waiting';

const TIMED_OUT = { code: 'BROKER_UNAVAILABLE', reason: 'REQUEST_TIMEOUT' };

/** What a call settled with, or `'still waiting'` long after the bound the bus promises. */
const outcomeOf = (call: Promise<unknown>): Promise<unknown> =>
  Promise.race([
    call.then(
      () => 'resolved',
      (error: unknown) => error,
    ),
    pause(2_000).then(() => 'still waiting'),
  ]);

const published = (publish: () => Promise<void>) => (): Promise<boolean> =>
  publish().then(
    () => true,
    () => false,
  );

// The in-memory broker alone: a relay in front of a real broker holds every reply or none, not
// the answer to one kind of request.
describe('RabbitMqEventBus: a broker that stopped answering its requests', { timeout: 30_000 }, () => {
  let broker: Broker;

  beforeEach(async () => {
    broker = await Broker.inMemory();
  });

  afterEach(async () => {
    await broker.dispose();
  });

  for (const request of ['connection', 'channel', 'declaration'] as const) {
    it(`rejects a publication in time when the broker never answers the ${request} of the link, then opens it again`, async () => {
      const network = await broker.network();
      const reported: RabbitMqFailure[] = [];

      const bus = broker.bus({
        connection: network.connection,
        publishTimeoutMs: 100,
        onFailure: failuresOf(reported),
      });

      network.stopAnswering(request);

      expect(await outcomeOf(bus.publish([anEvent('evt-1')]))).toMatchObject(TIMED_OUT);
      await eventually(() => reported.some(({ code }) => code === 'REQUEST_TIMEOUT'));

      network.restore();
      await eventually(published(() => bus.publish([anEvent('evt-2')])));
      await pause(50);

      // What the broker opened too late was closed when it arrived.
      expect([network.openConnections, network.openChannels]).toEqual([1, 2]);
      await network.close();
    });
  }

  it('rejects a publication in time when the broker never declares the queues of a new subscription', async () => {
    const network = await broker.network();
    const reported: RabbitMqFailure[] = [];
    const consumer = unique('billing');

    const bus = broker.bus({
      connection: network.connection,
      consumer,
      publishTimeoutMs: 100,
      onFailure: failuresOf(reported),
    });

    await bus.assertTopology();
    network.stopAnswering('declaration');
    bus.subscribe(PLACED, recorder().handler);

    expect(await outcomeOf(bus.publish([anEvent('evt-1')]))).toMatchObject({ code: 'BROKER_UNAVAILABLE' });
    // The start of the subscription gave up too, and its channel with it: the link rebuilds both.
    await eventually(() => reported.some(({ code }) => code === 'REQUEST_TIMEOUT'));

    network.restore();
    await eventually(published(() => bus.publish([anEvent('evt-2')])));
    await broker.settled(bus);
    await network.close();
  });

  it('closes in time when the broker never answers the close of its connection', async () => {
    const network = await broker.network();
    const bus = broker.bus({ connection: network.connection, publishTimeoutMs: 100 });

    await bus.publish([anEvent('evt-1')]);
    network.stopAnswering('close');

    expect(await outcomeOf(bus.close())).toBe('resolved');

    network.restore();
    await network.close();
  });
});
