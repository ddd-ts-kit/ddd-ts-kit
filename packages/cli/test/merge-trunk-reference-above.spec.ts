import { describe, expect, it } from 'vitest';
import { KEPT, merged, tablesFile } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';

/** A table of several lines: its header, its columns between `id` and `version`, its last line. */
function T(name: string, ...columns: readonly string[]): string[] {
  return [`export const ${name} = tbl('${name}', {`, '  id: col(),', ...columns, '  version: col(),', '});'];
}

/** A table as the generator writes it: its comment names its own state. */
function stored(name: string, ...columns: readonly string[]): string[] {
  return T(name, `  // TODO(domain): the columns of ${name}.`, ...columns);
}

/** A column of that name. */
function col(name: string): string {
  return `  ${name}: col(),`;
}

describe('merge-trunk, reading back what each declaration reads', () => {
  const NAME = ['export const ordersName = orders.name;'];

  it('sets a constant the trunk added under a table below that table, which the branch moved', () => {
    const settled = merged({
      base: tablesFile([T('orders'), T('payments')]),
      ours: tablesFile([T('payments'), T('orders', '  p: col(payments),')]),
      theirs: tablesFile([T('orders'), NAME, T('payments')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([T('payments'), T('orders', '  p: col(payments),'), NAME]));
  });

  it('sets a constant the branch added under a table below that table, which the trunk moved', () => {
    const settled = merged({
      base: tablesFile([T('orders'), T('payments'), T('shipments')]),
      ours: tablesFile([T('orders'), NAME, T('payments', col('paidAt')), T('shipments')]),
      theirs: tablesFile([T('payments', col('amount')), T('orders'), T('shipments')]),
    });

    expect(settled.content).not.toMatch(/ordersName[^]*export const orders = /);
    expect(settled.settled ? settled.how : 'left to a person').not.toBe(LINES);
  });

  it('sets it there too when the trunk moved the table to the end of the region', () => {
    const settled = merged({
      base: tablesFile([T('orders'), T('payments')]),
      ours: tablesFile([T('orders', col('total')), NAME, T('payments')]),
      theirs: tablesFile([T('payments'), T('orders', col('amount'))]),
    });

    expect(settled.content ?? '').not.toMatch(/ordersName[^]*export const orders = /);
    expect(settled.settled ? settled.how : 'left to a person').not.toBe(LINES);
  });

  it('keeps the lines of both sides when one side moved a table and the other added one under it, which reads nothing', () => {
    const settled = merged({
      base: tablesFile([stored('shipments'), stored('orders'), stored('settlements')]),
      ours: tablesFile([stored('orders'), T('settlements'), stored('shipments')]),
      theirs: tablesFile([stored('shipments'), T('ledgers'), stored('settlements')]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([T('ledgers'), T('settlements'), stored('shipments')]));
  });

  it('keeps the lines of both sides of a function a side wrote above the one it calls', () => {
    const first = ['export const ordersOf = (page: number): Row[] => rowsOf(orders, page);'];
    const second = ['export const rowsOf = (table: Table, page: number): Row[] => table.rows(page);'];

    const settled = merged({
      base: tablesFile([T('orders')]),
      ours: tablesFile([T('orders'), [...first, ...second]]),
      theirs: tablesFile([T('orders'), ['export const REFUNDS = 2;']]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([T('orders'), [...first, ...second, 'export const REFUNDS = 2;']]));
  });

  it('keeps the lines of both sides of two constants each side added at the end, in the order of those lines', () => {
    const settled = merged({
      base: tablesFile([T('orders')]),
      ours: tablesFile([T('orders', col('total')), ['export const INVOICES = 1;']]),
      theirs: tablesFile([T('orders', col('amount')), ['export const REFUNDS = 2;']]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      tablesFile([
        T('orders', col('total'), col('amount')),
        ['export const INVOICES = 1;', 'export const REFUNDS = 2;'],
      ]),
    );
  });
});
