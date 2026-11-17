import { describe, expect, it } from 'vitest';
import { readsTheName } from '../src/merge/declarations/reads-the-name';
import { merged, mergedTables, tablesFile, tablesOf } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';

const REMOVED =
  'the region `tables` holds a declaration one side removed and that a declaration the other side wrote reads, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed, the one removed kept or the other written without it.';

const ABOVE =
  'the region `tables` holds a declaration that would stand above one it reads once the two sides are merged, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed, in the order that holds for both.';

/** A table of several lines. */
function T(name: string, ...columns: readonly string[]): string[] {
  return [`export const ${name} = tbl('${name}', {`, '  id: col(),', ...columns, '  version: col(),', '});'];
}

/** The branch removed the table of the payments, the trunk wrote these lines under it. */
function removedAgainst(...written: readonly string[]): ReturnType<typeof merged> {
  return merged({
    base: tablesFile([T('orders'), T('payments')]),
    ours: tablesFile([T('orders')]),
    theirs: tablesFile([T('orders'), T('payments'), written]),
  });
}

describe('merge-trunk, on a declaration one side removed and the other started to read', () => {
  it.each([
    ['a constant reads it', 'export const paymentsName = payments.name;'],
    ['a type names it', 'export type Paid = typeof payments;'],
    ['an object holds it under its own name', 'export const view = { payments };'],
    ['an object spreads it', 'export const view = { ...payments, extra: 1 };'],
    ['a list spreads it', 'export const rows = [...payments];'],
    ['a call spreads it', 'export const count = countOf(...payments);'],
    ['a call is given it', 'export const count = countOf(orders, payments);'],
    ['a condition reads it', 'export const paid = payments ? 1 : 2;'],
  ])('writes nothing in the region when %s', (_what, written) => {
    const left = removedAgainst(written);

    expect(left).toMatchObject({ settled: false, advice: REMOVED });
    expect(left.content).toBeUndefined();
  });

  it.each([
    ['a key of an object bears its name', 'export const view = { payments: 1 };'],
    ['a member of another value bears its name', 'export const count = other.payments;'],
    ['an optional member of another value bears its name', 'export const count = other?.payments;'],
    ['a string holds its name', "export const label = 'payments';"],
    ['a comment names it', '// The payments went to another context.\nexport const moved = true;'],
    ['a parameter with no type bears its name', 'export const count = (payments) => payments.length;'],
    ['the parameter of an arrow bears its name', 'export const count = payments => payments.length;'],
    ['a parameter with a default bears its name', 'export const count = (payments = 1) => payments + 1;'],
    ['a parameter with a type bears its name', 'export const count = (payments: Row[]): number => payments.length;'],
    ['a rest parameter bears its name', 'export const count = (...payments: Row[]): number => payments.length;'],
    [
      'the builder of a table of Drizzle bears its name',
      "export const totals = tbl('totals', { id: col() }, (payments) => [check('kept', sql`${payments.deleted} is null`)]);",
    ],
    ['a parameter is destructured into it', 'export const count = ({ payments }: Props): number => payments.length;'],
    [
      'a parameter is destructured into it under a key',
      'export const count = ({ rows: payments }: Props) => payments;',
    ],
    [
      'a constant is destructured into it',
      'export function count(): number {\n  const { payments } = load();\n  return payments.length;\n}',
    ],
    [
      'a list is destructured into it',
      'export function count(): number {\n  const [payments] = load();\n  return payments;\n}',
    ],
    [
      'a local constant bears its name',
      'export function count(): number {\n  const payments = load();\n  return payments.length;\n}',
    ],
    [
      'a local function bears its name',
      'export function count(): number {\n  function payments(): number {\n    return 1;\n  }\n  return payments();\n}',
    ],
    [
      'a catch clause binds it',
      'export function safe(): void {\n  try {\n    run();\n  } catch (payments) {\n    log(payments);\n  }\n}',
    ],
    ['a member of an interface bears its name', 'export interface View {\n  payments: number;\n  refunds?: number;\n}'],
    ['a member of a type bears its name', 'export type View = { id: string; payments?: number };'],
    ['a method of an object bears its name', 'export const view = {\n  payments() {\n    return 1;\n  },\n};'],
    ['an accessor bears its name', 'export const view = {\n  get payments(): number {\n    return 1;\n  },\n};'],
    ['a field of a class bears its name', 'export class View {\n  private readonly payments = 1;\n  refunds;\n}'],
    ['a member of an enum bears its name', 'export enum Kind {\n  refunds,\n  payments,\n}'],
    ['a member of an enum with a value bears its name', "export enum Kind {\n  payments = 'paid',\n}"],
    [
      'a label bears its name',
      'export function scan(): void {\n  payments: for (const row of rows) {\n    if (row) break payments;\n  }\n}',
    ],
    ['an export gives another value its name', "export { settle as payments } from './settle';"],
  ])('keeps the lines of both sides when %s', (_what, written) => {
    const settled = removedAgainst(...written.split('\n'));

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([[...T('orders'), ...written.split('\n')]]));
  });

  it('writes nothing either when the side that kept it changed a declaration to read it', () => {
    const left = merged({
      base: tablesFile([T('orders'), T('payments'), ['export const LIMIT = 2;']]),
      ours: tablesFile([T('orders', '  total: col(),'), ['export const LIMIT = 2;']]),
      theirs: tablesFile([T('orders', '  amount: col(),'), T('payments'), ['export const LIMIT = payments.limit;']]),
    });

    expect(left).toMatchObject({ settled: false, advice: REMOVED });
  });

  it('merges the region when the declaration read it in the base already: the removal broke it on its own side', () => {
    const reads = (more: string): string[] => [`export const paid = payments.name${more};`];

    const lines = mergedTables({
      base: tablesFile([T('orders'), T('payments'), reads('')]),
      ours: tablesFile([T('orders'), reads('')]),
      theirs: tablesFile([T('orders'), T('payments'), reads(" ?? ''")]),
    });

    expect(lines).toEqual(tablesOf([T('orders'), reads(" ?? ''")]));
  });
});

describe('reading a name in the lines of a declaration', () => {
  it('takes a call left open for a read: nothing says it is a method', () => {
    const open = { key: 'text', lines: ['  payments('], ended: false, gap: 0, first: true };

    expect(readsTheName(open, 'payments')).toBe(true);
    expect(readsTheName(open, undefined)).toBe(false);
  });
});

describe('merge-trunk, on a region merged by declaration that would set one above a declaration it reads', () => {
  const NAME = ['export const ordersName = orders.name;'];
  const LIMIT = ['export const LIMIT = 2;'];

  const sides = {
    base: tablesFile([T('orders'), T('payments'), T('shipments')]),
    ours: tablesFile([T('orders'), T('payments'), NAME, T('shipments')]),
    theirs: tablesFile([T('payments'), LIMIT, T('shipments'), T('orders')]),
  };

  it('writes nothing in the region', () => {
    expect(mergedTables(sides)).toBeUndefined();
    expect(merged(sides)).toMatchObject({ settled: false, advice: ABOVE });
  });

  it('writes it when the constant reads nothing the other side moved', () => {
    const lines = mergedTables({ ...sides, ours: sides.ours.replace('orders.name', "'orders'") });

    expect(lines).toEqual(
      tablesOf([T('payments'), ["export const ordersName = 'orders';"], LIMIT, T('shipments'), T('orders')]),
    );
  });
});
