import { describe, expect, it } from 'vitest';
import type { RedisStreamsEventBusOptions } from '../src/streams/options/redis-streams-event-bus-options';
import { settingsOf } from '../src/streams/options/settings-of';

describe('the settings of a bus', () => {
  it('start a new group at the beginning of its stream unless told to start at the end', () => {
    expect(settingsOf({ connection: 'redis://127.0.0.1:1' }).startFrom).toBe('beginning');
    expect(settingsOf({ connection: 'redis://127.0.0.1:1', startFrom: 'end' }).startFrom).toBe('end');
  });

  it("refuse the former word of startFrom 'new', and name 'end' that replaced it", () => {
    const options = { connection: 'redis://127.0.0.1:1', startFrom: 'new' } as unknown as RedisStreamsEventBusOptions;

    expect(() => settingsOf(options)).toThrow(
      expect.objectContaining({
        code: 'START_FROM_REFUSED',
        message: "startFrom: 'new' is refused: write startFrom: 'end'",
      }),
    );
  });

  it('refuse a word startFrom never took, and name the two it takes', () => {
    const options = { connection: 'redis://127.0.0.1:1', startFrom: 'now' } as unknown as RedisStreamsEventBusOptions;

    expect(() => settingsOf(options)).toThrow("startFrom: 'now' is refused: write startFrom: 'beginning' or 'end'");
  });

  it('keep a hook that throws from throwing out of the bus', () => {
    const settings = settingsOf({
      connection: 'redis://127.0.0.1:1',
      onFailure: () => {
        throw new Error('the metrics backend is down');
      },
      onDelivery: () => {
        throw new Error('the metrics backend is down');
      },
    });

    expect(() => {
      settings.onFailure({ kind: 'connection', code: 'ECONNREFUSED' });
    }).not.toThrow();

    expect(() => {
      settings.onDelivery({
        stream: 'events:ordering.order.placed',
        consumer: 'billing',
        attempt: 1,
        outcome: 'acknowledged',
      });
    }).not.toThrow();
  });
});
