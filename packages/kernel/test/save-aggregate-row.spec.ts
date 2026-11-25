import { describe, expect, it } from 'vitest';
import {
  AggregateRoot,
  ConcurrencyError,
  FixedClock,
  FixedExecutionScope,
  executionContext,
  loadedAt,
  saveAggregateRow,
  type RowStatements,
} from '../src';

class Invoice extends AggregateRoot {
  constructor(id: string) {
    super(id);
  }
}

interface InvoiceColumns {
  readonly id: string;
  readonly total: number;
}

const at = new Date('2026-03-01T10:00:00.000Z');
const ada = { id: 'ada', type: 'user', roles: [], attributes: {} } as const;
const scope = new FixedExecutionScope(executionContext({ correlationId: 'corr-1', actor: ada, origin: 'http' }));

/** The statements of an ORM, noting what they were handed; `written` is what each answers. */
function statements(written: { readonly insert: boolean; readonly update: number }): {
  readonly noted: unknown[];
  readonly on: RowStatements<InvoiceColumns>;
} {
  const noted: unknown[] = [];

  return {
    noted,
    on: {
      insert: async (row, stamp) => {
        noted.push({ insert: row, stamp });

        return written.insert;
      },
      update: async (row, stamp, expected) => {
        noted.push({ update: row, stamp, expected });

        return written.update;
      },
    },
  };
}

const saving = (invoice: Invoice, on: RowStatements<InvoiceColumns>): Promise<void> =>
  saveAggregateRow({ aggregate: invoice, row: { id: invoice.id, total: 30 }, scope, clock: new FixedClock(at) }, on);

describe('saveAggregateRow', () => {
  it('inserts an aggregate never saved, at version 1, with the columns of the mapper and its creation stamp', async () => {
    const invoice = new Invoice('inv-1');
    const { noted, on } = statements({ insert: true, update: 0 });

    await saving(invoice, on);

    expect(noted).toEqual([
      {
        insert: { id: 'inv-1', total: 30, version: 1 },
        stamp: { createdAt: at, createdBy: 'ada', updatedAt: at, updatedBy: 'ada' },
      },
    ]);

    expect(invoice.version).toBe(1);
  });

  it('updates a loaded aggregate while its row holds the version it read, with its update stamp', async () => {
    const invoice = loadedAt(new Invoice('inv-1'), 4);
    const { noted, on } = statements({ insert: false, update: 1 });

    await saving(invoice, on);

    expect(noted).toEqual([
      { update: { id: 'inv-1', total: 30, version: 5 }, stamp: { updatedAt: at, updatedBy: 'ada' }, expected: 4 },
    ]);

    expect(invoice.version).toBe(5);
  });

  it('raises a ConcurrencyError and keeps the version when the key is taken or the row moved', async () => {
    const born = new Invoice('inv-1');
    const stale = loadedAt(new Invoice('inv-2'), 4);
    const { on } = statements({ insert: false, update: 0 });

    await expect(saving(born, on)).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(saving(stale, on)).rejects.toBeInstanceOf(ConcurrencyError);
    expect([born.version, stale.version]).toEqual([0, 4]);
  });
});
