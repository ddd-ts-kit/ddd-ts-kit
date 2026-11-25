import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { streamNamesOf } from '../src/event-bus';
import { anEvent, recorder, unique } from './support/events';
import { SERVERS, serverOf } from './support/servers';
import { MAX_ATTEMPTS, RETRY_DELAY_MS, Server } from './support/streams';
import { eventually, pause } from './support/waiting';

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

    it('keeps an event of a type whose handlers all left for the next handler, counted as no attempt', async () => {
      const consumer = unique('billing');
      const bus = sharing(consumer);
      const attempts: (number | undefined)[] = [];

      bus.subscribe(CANCELLED, async () => undefined);
      bus.subscribe(PLACED, async () => undefined).unsubscribe();
      await bus.publish([anEvent('evt-1', PLACED)]);
      // Longer than every retry of a failing handler would take.
      await pause(RETRY_DELAY_MS * MAX_ATTEMPTS * 4);

      expect(await server.length(streamNamesOf({ consumer, type: PLACED }, () => stream).dead)).toBe(0);
      expect(await server.pending(stream, consumer)).toBe(1);

      bus.subscribe(PLACED, async (_event, delivery) => {
        attempts.push(delivery?.attempt);
      });

      await eventually(() => attempts.length === 1);

      expect(attempts).toEqual([1]);
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
