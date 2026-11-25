import { describe, expect, it } from 'vitest';
import { InMemoryEventStore, type EventToAppend, type StoredData } from '../src';

const weighed = (id: string, data: StoredData = {}): EventToAppend => ({
  id,
  type: 'shipping.parcel.weighed',
  schemaVersion: 1,
  data,
  occurredAt: new Date('2026-10-18T09:30:00.000Z'),
});

/** What a cast lets through: data no store can keep. */
function unstorable(): StoredData {
  return { weigh: () => 12 } as unknown as StoredData;
}

describe('InMemoryEventStore', () => {
  it('appends all the events of a batch, or none', async () => {
    const store = new InMemoryEventStore();

    await expect(store.append('parcel-1', 0, [weighed('a1'), weighed('a2', unstorable())])).rejects.toThrow(
      /could not be cloned/,
    );

    expect(await store.readStream('parcel-1')).toEqual([]);
    expect(await store.head()).toBe(0);
  });

  it('places the events of a batch one after the other, in the stream and in the store', async () => {
    const store = new InMemoryEventStore();

    await store.append('parcel-1', 0, [weighed('a1')]);

    expect(await store.append('parcel-2', 0, [weighed('b1'), weighed('b2')])).toEqual({ version: 2, position: 3 });

    expect((await store.readStream('parcel-2')).map(({ version, position }) => [version, position])).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });
});
