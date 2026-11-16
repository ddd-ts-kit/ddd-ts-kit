import { describe, expect, it } from 'vitest';
import { declarationsOf } from '../src/merge/declarations/declarations-of';
import type { MergedDeclaration } from '../src/merge/declarations/merge-declarations';
import { readsAsMerged } from '../src/merge/declarations/reads-as-merged';
import { resolveConflict } from '../src/merge/resolve-conflict';
import {
  INVOICES,
  merged,
  mergedTables,
  ORDERS,
  REFUNDS,
  REPO,
  TABLES_FILE,
  tablesFile,
} from './support/declared-tables-file';
import { threeWayPath } from './support/three-way-path';

describe('the declarations of a region', () => {
  it('are read whole: a statement to the line that ends it or to a blank line, with the comments above it', () => {
    const read = declarationsOf([
      '',
      '/** The orders of billing. */',
      "export const orders = billingSchema.table('orders', {",
      "  id: text('id'),",
      '',
      "  total: integer('total'),",
      '})',
      '',
      '',
      'export type OrderRow =',
      '  | typeof orders.$inferSelect',
      '  | undefined;',
      'registerTables(orders);',
      '// What is left to write.',
      '',
    ]);

    expect(read?.declarations.map(({ key, lines, gap, first }) => ({ key, lines: lines.length, gap, first }))).toEqual([
      { key: 'name orders', lines: 6, gap: 1, first: true },
      { key: 'name OrderRow', lines: 3, gap: 2, first: false },
      { key: 'text registerTables(orders);', lines: 1, gap: 0, first: false },
      { key: 'text // What is left to write.\n', lines: 2, gap: 0, first: false },
    ]);

    expect(declarationsOf(['', 'const one = 1;', '', ''])).toMatchObject({ trailing: 2 });
  });

  it('are not read from a region whose brackets do not pair, that holds a region, or two declarations of one name', () => {
    expect(declarationsOf(['export const orders = table({', '  id: 1,'])).toBeUndefined();
    expect(declarationsOf(['export const orders = table(', '  id: 1,', '});'])).toBeUndefined();
    expect(declarationsOf(['});'])).toBeUndefined();
    expect(declarationsOf(['// ddd-ts-kit:columns', '// /ddd-ts-kit:columns'])).toBeUndefined();
    expect(declarationsOf(['const orders = 1;', 'const orders = 2;'])).toBeUndefined();
    expect(declarationsOf(['const pattern = /^[a-z]+$/;'])).toBeUndefined();
  });

  it('are left as git wrote them when a side holds no such region, or holds it twice', () => {
    const sides = { ours: tablesFile([ORDERS, INVOICES]), theirs: tablesFile([ORDERS, REFUNDS]) };
    const twice = `${tablesFile([ORDERS])}// ddd-ts-kit:tables\n// /ddd-ts-kit:tables\n`;

    const wholeFile = merged({ base: '', ...sides });

    expect(wholeFile).toMatchObject({ settled: false, content: undefined });
    expect(wholeFile.advice).toBeUndefined();

    expect(
      resolveConflict({ ...threeWayPath(TABLES_FILE, { base: tablesFile([ORDERS]), ...sides }), base: twice }, REPO),
    ).toMatchObject({
      settled: false,
      content: undefined,
      advice: expect.stringContaining('could not read with certainty'),
    });
  });
});

describe('the name a declaration is merged by', () => {
  it('is the identifier declared, whatever stands before it, and `default` for a default export that declares none', () => {
    const read = declarationsOf([
      'export const enum OrderStatus {',
      "  Placed = 'placed',",
      '}',
      'export const enum InvoiceStatus {',
      "  Sent = 'sent',",
      '}',
      'export declare const ordersTable: string;',
      'export default class Orders {}',
      'export abstract class Rows {}',
      'export async function loadOrders(): Promise<void> {}',
      'declare namespace Billing {}',
      'export default loadOrders;',
    ]);

    expect(read?.declarations.map(({ name }) => name)).toEqual([
      'OrderStatus',
      'InvoiceStatus',
      'ordersTable',
      'Orders',
      'Rows',
      'loadOrders',
      'Billing',
      'default',
    ]);
  });

  it('is one for a statement that goes on after a comma, type arguments wrapped or a second constant', () => {
    const read = declarationsOf([
      'export const orders = new EntitySchema<',
      '  OrderRow,',
      '  OrderRowRelations',
      '>({',
      "  tableName: 'orders',",
      '});',
      "export const first = text('a'),",
      "  second = text('b');",
    ]);

    expect(read?.declarations.map(({ name, lines }) => [name, lines.length])).toEqual([
      ['orders', 6],
      ['first', 2],
    ]);
  });

  it('starts another declaration on a line that declares another name, with the comments above it', () => {
    const read = declarationsOf([
      "export const orders = billingSchema.table('orders', {",
      "  id: text('id'),",
      '})',
      '// The invoices of billing.',
      "export const invoices = billingSchema.table('invoices', {",
      "  id: text('id'),",
      '})',
      'export const rows =',
      '  class Rows {}',
    ]);

    expect(read?.declarations.map(({ name, lines }) => [name, lines[0]])).toEqual([
      ['orders', "export const orders = billingSchema.table('orders', {"],
      ['invoices', '// The invoices of billing.'],
      ['rows', 'export const rows ='],
    ]);
  });
});

describe('the last check before a merged region is written', () => {
  const one = (lines: readonly string[], gap: number, first = false): MergedDeclaration => ({
    kind: 'kept',
    declaration: { key: `text ${lines.join('\n')}`, lines, gap, first, ended: true },
  });

  it('refuses lines that do not read back as the declarations merged', () => {
    const ours = { declarations: [], trailing: 0 };
    const call = one(['register(orders)'], 0, true);

    expect(readsAsMerged([call, one(['audit(orders);'], 1)], ours)).toBe(true);
    // Set side by side, the two statements read as one: a statement would have changed its meaning.
    expect(readsAsMerged([call, one(['audit(orders);'], 0)], ours)).toBe(false);
    expect(readsAsMerged([one(['register(orders'], 0, true)], ours)).toBe(false);
  });

  it('leaves the region as git wrote it when the merged lines are refused', () => {
    const file = (...statements: readonly string[]): string =>
      ['// ddd-ts-kit:tables', ...statements, '// /ddd-ts-kit:tables', ''].join('\n');

    // Our side dropped the semicolon the trunk's next statement stood after: side by side, the two would read as one.
    const lines = mergedTables({
      base: file('const limit = 1;'),
      ours: file('const limit = 2'),
      theirs: file('const limit = 1;', '[limit].forEach(check);'),
    });

    expect(lines).toBeUndefined();
  });
});
