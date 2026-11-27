import { describe, expect, it } from 'vitest';
import {
  InMemoryCheckpointStore,
  InMemoryEventStore,
  InMemoryProcessStore,
  InMemoryProcessedEventStore,
  InMemoryReadModelTable,
  InMemorySnapshotStore,
  InMemoryUnitOfWork,
  RollbackMap,
  atCommit,
  onRollback,
  type EventToAppend,
} from '../src';

const declined = new Error('the card was declined');

const failed = (work: () => Promise<void>): Promise<unknown> =>
  new InMemoryUnitOfWork().run(async () => {
    await work();

    throw declined;
  });

const weighed = (id: string): EventToAppend => ({
  id,
  type: 'shipping.parcel.weighed',
  schemaVersion: 1,
  data: {},
  occurredAt: new Date('2026-10-18T09:30:00.000Z'),
});

describe('onRollback', () => {
  it('runs what it is handed when the unit of work rolls back, newest first, once the commit steps are undone', async () => {
    const journal: string[] = [];

    const failing = new InMemoryUnitOfWork().run(async () => {
      onRollback(() => journal.push('undo first'));
      await atCommit({ apply: async () => undefined, undo: async () => void journal.push('undo the step') });
      await atCommit({ apply: () => Promise.reject(declined), undo: async () => undefined });

      onRollback(() => {
        journal.push('undo second');

        throw new Error('an undo that fails');
      });
    });

    await expect(failing).rejects.toBe(declined);
    expect(journal).toEqual(['undo the step', 'undo second', 'undo first']);
  });

  it('keeps nothing when the unit of work commits, nor outside of any', async () => {
    const journal: string[] = [];

    await new InMemoryUnitOfWork().run(async () => onRollback(() => journal.push('inside')));
    onRollback(() => journal.push('outside'));

    expect(journal).toEqual([]);
  });
});

describe('RollbackMap', () => {
  it('puts back each key a failed unit of work set or deleted, and keeps what a committed one wrote', async () => {
    const stock = new RollbackMap([['pen', 3]]);

    await new InMemoryUnitOfWork().run(async () => void stock.set('ink', 1));

    await expect(
      failed(async () => {
        stock.set('pen', 2).set('pen', 1).set('book', 4);
        stock.delete('ink');
        stock.delete('paper');
      }),
    ).rejects.toBe(declined);

    expect([...stock]).toEqual([
      ['pen', 3],
      ['ink', 1],
    ]);
  });

  it('leaves a key a command running alongside committed over', async () => {
    const stock = new RollbackMap<string, number>();
    const opened: { release?: () => void } = {};

    const gate = new Promise<void>((resolve) => {
      opened.release = resolve;
    });

    const failing = failed(async () => {
      stock.set('pen', 1);
      stock.set('ink', 1);
      await gate;
    });

    await new InMemoryUnitOfWork().run(async () => {
      stock.set('pen', 2);
      stock.delete('ink');
    });

    opened.release?.();
    await expect(failing).rejects.toBe(declined);

    expect([...stock]).toEqual([['pen', 2]]);
  });

  it('takes nothing of the entries it started with, made inside the unit of work', async () => {
    const made: { stock?: RollbackMap<string, number> } = {};

    await expect(
      failed(async () => {
        made.stock = new RollbackMap([['pen', 3]]);
      }),
    ).rejects.toBe(declined);

    expect([...(made.stock ?? [])]).toEqual([['pen', 3]]);
  });
});

describe('the stores in memory, in a unit of work that rolls back', () => {
  it('take back an append from the event store, and hand its positions out no more', async () => {
    const store = new InMemoryEventStore();

    await store.append('parcel-1', 0, [weighed('a1')]);
    await expect(failed(async () => void (await store.append('parcel-1', 1, [weighed('a2')])))).rejects.toBe(declined);
    await store.append('parcel-2', 0, [weighed('b1')]);

    expect((await store.readStream('parcel-1')).map((event) => event.id)).toEqual(['a1']);
    expect((await store.readAll(1, 10)).map((event) => [event.id, event.position])).toEqual([['b1', 3]]);
    expect(await store.head()).toBe(3);
  });

  it('give back the mark of a consumer, the save of a process, a checkpoint, a snapshot and a row of a read model', async () => {
    const processed = new InMemoryProcessedEventStore();
    const processes = new InMemoryProcessStore();
    const checkpoints = new InMemoryCheckpointStore();
    const snapshots = new InMemorySnapshotStore();
    const table = new InMemoryReadModelTable<{ readonly total: number }>();
    const stamp = { eventId: 'e1', occurredAt: new Date('2026-10-18T09:30:00.000Z') };

    await expect(
      failed(async () => {
        await processed.markProcessed('billing', 'e1');
        await processes.save({ name: 'shipping', id: 'p1', version: 1, state: {}, ended: false, timeouts: {} });
        await checkpoints.advance('projector', 0, 4);
        await snapshots.save({ stream: 'parcel-1', version: 3, schemaVersion: 1, data: {} });
        await table.insert({ key: 'order-1', row: { total: 3 }, stamp });
      }),
    ).rejects.toBe(declined);

    expect(await processed.markProcessed('billing', 'e1')).toBe(true);
    expect(processes.list()).toEqual([]);
    expect(await checkpoints.position('projector')).toBe(0);
    expect(await snapshots.find('parcel-1')).toBeUndefined();
    expect(await table.find('order-1')).toBeUndefined();
  });
});
