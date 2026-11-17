import { describe, expect, it } from 'vitest';
import { INVOICES, KEPT, merged, ORDERS, REFUNDS, table, tablesFile } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';
const TOTAL = "  total: integer('total').notNull(),";
const AMOUNT = "  amount: integer('amount').notNull(),";
const PAYMENTS = table('payments');
const SHIPMENTS = table('shipments');

/** A table as `generate repository` writes it, its comment naming its own state as the generator does. */
function stored(name: string, ...columns: readonly string[]): string[] {
  return table(name, ...columns).map((line) => line.replace('TODO(domain):', `TODO(domain): of ${name},`));
}

/** A hunk that holds the three versions of one declaration, each whole. */
function hunk(ours: readonly string[], base: readonly string[], theirs: readonly string[], label: string): string[] {
  return ['<<<<<<< HEAD', ...ours, label, ...base, '=======', ...theirs, '>>>>>>> main'];
}

describe('merge-trunk, when git cut a hunk in the middle of two declarations', () => {
  it('never writes the column of the trunk into the table the branch added below', () => {
    const ours = table('orders', TOTAL);
    const theirs = table('orders', AMOUNT);

    const left = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ours, INVOICES]),
      theirs: tablesFile([theirs]),
    });

    expect(left).toMatchObject({
      settled: false,
      how: 'a conflict in the declarations of the region `tables`',
      advice:
        'the two sides do not agree on `orders` in the region `tables`: for each, write the one declaration that keeps the intent of both, whole, or remove it.',
    });

    expect(left.blocks).toHaveLength(1);

    expect(left.content).toBe(
      tablesFile([hunk(ours, ORDERS, theirs, left.blocks[0]?.raw[ours.length + 1] ?? ''), INVOICES]),
    );
  });

  it('never writes it there when the trunk wrote its column over the comment of the table', () => {
    const ours = table('orders', TOTAL);
    const theirs = ORDERS.map((line) => (line.includes('TODO(domain)') ? AMOUNT : line));

    const left = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ours, INVOICES]),
      theirs: tablesFile([theirs]),
    });

    expect(left.settled).toBe(false);
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, base: ORDERS, theirs });
  });

  it('keeps the lines of both sides when the trunk only removed the comment of the table the branch added a column to', () => {
    const settled = merged({
      base: tablesFile([stored('orders')]),
      ours: tablesFile([stored('orders', TOTAL), stored('invoices')]),
      theirs: tablesFile([stored('orders').filter((line) => !line.includes('TODO(domain)'))]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });

    expect(settled.content).toBe(
      tablesFile([stored('orders', TOTAL).filter((line) => !line.includes('TODO(domain)')), stored('invoices')]),
    );
  });

  it('keeps the lines of both sides when both added the same column and the branch a table below', () => {
    const settled = merged({
      base: tablesFile([stored('orders')]),
      ours: tablesFile([stored('orders', TOTAL), stored('invoices')]),
      theirs: tablesFile([stored('orders', TOTAL)]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });
    expect(settled.content).toBe(tablesFile([stored('orders', TOTAL), stored('invoices')]));
  });

  it('keeps the lines of both sides when the trunk added the table and the branch the column above it', () => {
    const settled = merged({
      base: tablesFile([stored('orders')]),
      ours: tablesFile([stored('orders', TOTAL)]),
      theirs: tablesFile([stored('orders', AMOUNT), stored('invoices')]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });
    expect(settled.content).toBe(tablesFile([stored('orders', TOTAL, AMOUNT), stored('invoices')]));
  });

  it('leaves to a person the table the branch removed and the trunk added a column to, and merges the rest', () => {
    const changed = stored('payments', AMOUNT);

    const left = merged({
      base: tablesFile([stored('orders'), stored('payments')]),
      ours: tablesFile([stored('orders'), stored('invoices')]),
      theirs: tablesFile([stored('orders'), changed, stored('refunds')]),
    });

    expect(left).toMatchObject({
      settled: false,
      advice:
        'the two sides do not agree in the region `tables`: for each hunk, write the one declaration that keeps the intent of both, whole, or remove it. If a declaration of the side that removed it is this one under another name, write the change there and remove the hunk.',
    });

    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours: [], base: stored('payments'), theirs: changed });

    expect(left.content).toBe(
      tablesFile([
        stored('orders'),
        hunk([], stored('payments'), changed, left.blocks[0]?.raw[1] ?? ''),
        stored('refunds'),
        stored('invoices'),
      ]),
    );
  });
});

describe('merge-trunk, when one side gave another name to a table the other added a column to', () => {
  it('leaves the table to a person, whole, where its column would stand under the other name', () => {
    const changed = stored('payments', AMOUNT);

    const left = merged({
      base: tablesFile([stored('orders'), stored('payments')]),
      ours: tablesFile([stored('orders'), stored('invoices')]),
      theirs: tablesFile([stored('orders'), changed]),
    });

    expect(left).toMatchObject({ settled: false, how: 'a conflict in the declarations of the region `tables`' });
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours: [], base: stored('payments'), theirs: changed });

    expect(left.content).toBe(
      tablesFile([
        stored('orders'),
        hunk([], stored('payments'), changed, left.blocks[0]?.raw[1] ?? ''),
        stored('invoices'),
      ]),
    );
  });

  it('keeps the lines of both sides when the other side left that table as the base holds it', () => {
    const settled = merged({
      base: tablesFile([stored('orders'), stored('payments')]),
      ours: tablesFile([stored('orders', TOTAL), stored('invoices')]),
      theirs: tablesFile([stored('orders', AMOUNT), stored('payments')]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([stored('orders', TOTAL, AMOUNT), stored('invoices')]));
  });
});

describe('merge-trunk, when the two sides set the tables of a region in two different orders', () => {
  const BASE = [stored('orders'), stored('payments'), stored('shipments')];

  it('writes nothing when each reordered them its own way and added one: a header would stand above another table', () => {
    const left = merged({
      base: tablesFile(BASE),
      ours: tablesFile([stored('payments'), stored('orders'), stored('shipments'), stored('invoices')]),
      theirs: tablesFile([stored('orders'), stored('shipments'), stored('payments'), stored('refunds')]),
    });

    expect(left).toMatchObject({ settled: false, content: undefined });
    expect(left.advice).toContain('holds declarations the two sides set in two different orders');
  });

  it('keeps the lines of both sides where they give every table whole and once, in the order of those lines', () => {
    const settled = merged({
      base: tablesFile(BASE),
      ours: tablesFile([stored('orders'), stored('shipments'), stored('payments'), stored('invoices')]),
      theirs: tablesFile([stored('payments'), stored('orders'), stored('shipments'), stored('refunds')]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      tablesFile([stored('payments'), stored('shipments'), stored('orders'), stored('invoices'), stored('refunds')]),
    );
  });

  it('keeps the column the branch added in its table when the trunk alone reordered them', () => {
    const settled = merged({
      base: tablesFile(BASE),
      ours: tablesFile([stored('orders'), stored('payments', TOTAL), stored('shipments')]),
      theirs: tablesFile([stored('payments'), stored('orders'), stored('shipments')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([stored('payments', TOTAL), stored('orders'), stored('shipments')]));
  });

  it('keeps the lines of both sides of tables set in one order', () => {
    const settled = merged({
      base: tablesFile([ORDERS, PAYMENTS, SHIPMENTS]),
      ours: tablesFile([ORDERS, table('payments', TOTAL), SHIPMENTS]),
      theirs: tablesFile([ORDERS, table('payments', AMOUNT), SHIPMENTS, REFUNDS]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([ORDERS, table('payments', TOTAL, AMOUNT), SHIPMENTS, REFUNDS]));
  });
});
