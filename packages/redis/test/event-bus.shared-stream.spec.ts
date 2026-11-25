import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anEvent, recorder, unique } from './support/events';
import { SERVERS, serverOf } from './support/servers';
import { Server } from './support/streams';

const PLACED = 'ordering.order.placed';
const CANCELLED = 'ordering.order.cancelled';
const SHIPPED = 'ordering.order.shipped';

describe.each(SERVERS)(
  'RedisStreamsEventBus, a stream shared by several types, %s',
  { timeout: 30_000 },
  (_name, start) => {
    const redis = serverOf(start);

    let server: Server;
    let prefix: string;
    let stream: string;

    beforeEach(() => {
      server = Server.connect(redis.url);
      prefix = unique('test-events');
      stream = `${prefix}:ordering`;
    });

    afterEach(async () => {
      await server.dispose();
    });

    const sharing = (consumer = unique('billing')) => server.bus({ prefix, consumer, streamOf: () => stream });

    it('hands each handler the events of its type only', async () => {
      const bus = sharing();
      const [placed, cancelled] = [recorder(), recorder()];

      bus.subscribe(PLACED, placed.handler);
      bus.subscribe(CANCELLED, cancelled.handler);
      await bus.publish([anEvent('evt-1', PLACED), anEvent('evt-2', CANCELLED), anEvent('evt-3', PLACED)]);
      await server.settled(bus);

      expect(placed.ids()).toEqual(['evt-1', 'evt-3']);
      expect(cancelled.ids()).toEqual(['evt-2']);
    });

    it('acknowledges an event of a type it never subscribed to, and goes on', async () => {
      const consumer = unique('billing');
      const bus = sharing(consumer);
      const placed = recorder();

      bus.subscribe(PLACED, placed.handler);
      await bus.publish([anEvent('evt-1', SHIPPED), anEvent('evt-2', PLACED)]);
      await server.settled(bus);

      expect(placed.ids()).toEqual(['evt-2']);
      expect(await server.pending(stream, consumer)).toBe(0);
    });

    it('describes every type it reads on the stream', () => {
      const bus = sharing();

      bus.subscribe(PLACED, async () => undefined);
      bus.subscribe(CANCELLED, async () => undefined);

      const events = bus.describeTopology().streams.filter(({ role }) => role === 'events');

      expect(events).toEqual([
        { name: stream, role: 'events', type: PLACED },
        { name: stream, role: 'events', type: CANCELLED },
      ]);
    });
  },
);
