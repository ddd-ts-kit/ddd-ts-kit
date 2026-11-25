import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { describe, expect, it } from 'vitest';
import { KafkaEventBus } from '../src';
import { InMemoryKafka } from './support/cluster/in-memory-kafka';
import { PLACED } from './support/events';
import { eventually, pause } from './support/waiting';

const CANCELLED = 'ordering.order.cancelled';

/**
 * A cluster whose groups tell a member of its partitions only when the test says so: the time
 * a real coordinator takes to answer a join, during which a bus goes on subscribing.
 */
function slowCoordinator(cluster: KafkaJS.Kafka) {
  const held: (() => void)[] = [];

  const slow: KafkaJS.Kafka = {
    producer: (config) => cluster.producer(config),
    admin: (config) => cluster.admin(config),
    consumer: (config) => {
      const tell: unknown = config?.rebalance_cb;

      return cluster.consumer({
        ...config,
        rebalance_cb: (...told: unknown[]) => {
          held.push(() => {
            if (typeof tell === 'function') {
              Reflect.apply(tell, undefined, told);
            }
          });
        },
      });
    },
  };

  return { cluster: slow, toldSoFar: () => held.length, answer: () => held.splice(0).forEach((tell) => tell()) };
}

describe('KafkaEventBus: a subscription added while the group joins, in memory', { timeout: 30_000 }, () => {
  it('is consuming, for whoever waited for the first join as for the second, once the partitions came', async () => {
    const coordinator = slowCoordinator(new InMemoryKafka());
    const bus = new KafkaEventBus({ brokers: '127.0.0.1:1', cluster: coordinator.cluster, consumer: 'billing' });

    bus.subscribe(PLACED, async () => undefined);
    const first = bus.assertTopology().then(() => 'consuming');

    await eventually(() => coordinator.toldSoFar() > 0);
    await pause(20);
    bus.subscribe(CANCELLED, async () => undefined);
    const second = bus.assertTopology().then(() => 'consuming');

    await eventually(() => coordinator.toldSoFar() > 1);
    coordinator.answer();

    const stillJoining = pause(1_000).then(() => 'still joining');

    expect(await Promise.race([second, stillJoining])).toBe('consuming');
    expect(await Promise.race([first, stillJoining])).toBe('consuming');

    await bus.close();
  });
});
