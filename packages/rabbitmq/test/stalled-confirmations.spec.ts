import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queueNamesOf } from '../src';
import { Broker } from './support/broker';
import { MAX_ATTEMPTS } from './support/environment';
import { PLACED, anEvent } from './support/events';
import { InvoicingFailed } from './support/invoicing-failed';
import { recorder } from './support/recorder';
import { unique } from './support/unique';
import { eventually, pause } from './support/waiting';

// The in-memory broker alone: a relay that holds the replies of a real broker would hold its
// deliveries and the answer to a `get` too, not only its confirmations.
describe('RabbitMqEventBus: a broker that stopped confirming', { timeout: 30_000 }, () => {
  let broker: Broker;

  beforeEach(async () => {
    broker = await Broker.inMemory();
  });

  afterEach(async () => {
    await broker.dispose();
  });

  it('hands a failed message back when its copy to the retry queue is not confirmed in time, and closes', async () => {
    const network = await broker.network();
    const [consumer, exchange] = [unique('billing'), unique('test-events')];
    const bus = broker.bus({ connection: network.connection, consumer, exchange, publishTimeoutMs: 100 });
    const { work } = queueNamesOf({ consumer, type: PLACED });

    bus.subscribe(PLACED, async () => {
      throw new InvoicingFailed();
    });

    await bus.assertTopology();
    broker.remember(bus);
    network.holdReplies();
    await broker.bus({ exchange }).publish([anEvent('evt-1')]);
    await eventually(() => bus.deliveriesInFlight === 1);

    const closing = bus.close().then(() => 'closed');

    expect(await Promise.race([closing, pause(2_000).then(() => 'still closing')])).toBe('closed');
    expect(await broker.readyIn(work)).toBeGreaterThan(0);

    network.restore();
    await network.close();
  });

  it('rejects a replay whose copy to the work queue is not confirmed in time, and leaves the message dead', async () => {
    const network = await broker.network();
    const consumer = unique('billing');
    const bus = broker.bus({ connection: network.connection, consumer, publishTimeoutMs: 100 });
    const subscription = bus.subscribe(PLACED, recorder(MAX_ATTEMPTS).handler);
    const { dead } = queueNamesOf({ consumer, type: PLACED });

    await bus.publish([anEvent('evt-1')]);
    await broker.settled(bus);
    subscription.unsubscribe();
    network.holdReplies();

    const replay = bus.replayDead({ consumer, type: PLACED }).catch((error: unknown) => error);

    expect(await Promise.race([replay, pause(2_000).then(() => 'still replaying')])).toMatchObject({
      code: 'PUBLISH_NOT_CONFIRMED',
    });

    await eventually(async () => (await broker.readyIn(dead)) === 1);

    network.restore();
    await network.close();
  });
});
