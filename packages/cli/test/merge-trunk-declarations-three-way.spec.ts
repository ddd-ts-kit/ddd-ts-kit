import { describe, expect, it } from 'vitest';
import { scan } from '../src/check/scan/scan';
import { bracketsLeftOpen } from '../src/merge/declarations/brackets-left-open';
import type { DeclaredSide } from '../src/merge/declarations/declared-side';
import { declarationsOf } from '../src/merge/declarations/declarations-of';
import { mergeDeclarations } from '../src/merge/declarations/merge-declarations';
import { INVOICES, KEPT, merged, ORDERS, REFUNDS, table, tablesFile } from './support/declared-tables-file';

/** Whether every bracket of a source is closed by its own kind, comments and strings left out. */
function isBalanced(text: string | null | undefined): boolean {
  return bracketsLeftOpen(scan(text ?? '(').code)?.length === 0;
}

describe('merge-trunk, in a region of declarations both sides changed', () => {
  it('keeps the two tables one side added and the one the other added', () => {
    const payments = table('payments');

    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, INVOICES, payments]),
      theirs: tablesFile([ORDERS, REFUNDS]),
    });

    expect(settled.content).toBe(tablesFile([ORDERS, REFUNDS, INVOICES, payments]));
  });

  it('keeps once a table both sides added alike', () => {
    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, REFUNDS, INVOICES]),
      theirs: tablesFile([ORDERS, REFUNDS]),
    });

    expect(settled).toMatchObject({ settled: true });
    expect(settled.content).toBe(tablesFile([ORDERS, REFUNDS, INVOICES]));
  });

  it('takes the edit one side made to a table the other left alone, and a removal the same way', () => {
    const edited = table('orders', "  total: integer('total').notNull(),");
    const payments = table('payments');

    const side = (...tables: readonly (readonly string[])[]): DeclaredSide =>
      declarationsOf(tables.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines]))) ?? {
        declarations: [],
        trailing: 0,
      };

    // git merges such an edit alone when it lies apart from what both sides add; the merge of the declarations takes it the same way.
    const taken = mergeDeclarations(
      {
        base: side(ORDERS, payments),
        ours: side(edited, payments, INVOICES),
        theirs: side(ORDERS, table('payments', "  paidAt: text('paid_at'),"), REFUNDS),
      },
      () => undefined,
    );

    expect(
      'merged' in taken && taken.merged.map((item) => (item.kind === 'kept' ? item.declaration.lines : item.kind)),
    ).toEqual([edited, table('payments', "  paidAt: text('paid_at'),"), REFUNDS, INVOICES]);

    const removed = merged({
      base: tablesFile([payments, ORDERS]),
      ours: tablesFile([ORDERS, INVOICES]),
      theirs: tablesFile([payments, ORDERS, REFUNDS]),
    });

    expect(removed).toMatchObject({ settled: true, how: KEPT });
    expect(removed.content).toBe(tablesFile([ORDERS, REFUNDS, INVOICES]));

    const removedHere = merged({
      base: tablesFile([payments, ORDERS]),
      ours: tablesFile([ORDERS, INVOICES]),
      theirs: tablesFile([table('payments', "  paidAt: text('paid_at'),"), ORDERS, REFUNDS]),
    });

    expect(removedHere.settled).toBe(false);
    expect(removedHere.blocks).toHaveLength(1);
    expect(removedHere.blocks[0]).toMatchObject({ ours: [], base: payments });

    expect(removedHere.advice).toBe(
      'the two sides do not agree in the region `tables`: for each hunk, write the one declaration that keeps the intent of both, whole, or remove it.',
    );
  });
});

describe('merge-trunk, on a declaration the two sides do not agree on', () => {
  it('leaves to a person a table both sides edited differently, whole in its three versions, and merges the rest', () => {
    const ours = table('orders', "  total: integer('total').notNull(),");
    const theirs = table('orders', "  amount: integer('amount').notNull(),");

    const left = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ours, INVOICES]),
      theirs: tablesFile([theirs, REFUNDS]),
    });

    expect(left).toMatchObject({
      kind: 'source',
      settled: false,
      how: 'a conflict in the declarations of the region `tables`',
      advice:
        'the two sides do not agree on `orders` in the region `tables`: for each, write the one declaration that keeps the intent of both, whole, or remove it.',
    });

    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, base: ORDERS, theirs });

    expect(left.content).toBe(
      tablesFile([
        [
          '<<<<<<< HEAD',
          ...ours,
          left.blocks[0]?.raw[ours.length + 1] ?? '',
          ...ORDERS,
          '=======',
          ...theirs,
          '>>>>>>> main',
        ],
        REFUNDS,
        INVOICES,
      ]),
    );

    const resolved = (left.content ?? '').replace(/<<<<<<< HEAD\n[^]*?\n=======\n([^]*?\n)>>>>>>> main\n/, '$1');

    expect(isBalanced(resolved)).toBe(true);
  });

  it('leaves to a person a table both sides added under one name with different columns', () => {
    const ours = table('invoices', "  total: integer('total').notNull(),");
    const theirs = table('invoices', "  amount: integer('amount').notNull(),");

    const left = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, ours]),
      theirs: tablesFile([ORDERS, theirs]),
    });

    expect(left.settled).toBe(false);
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, base: [], theirs });
    expect(left.advice).toContain('do not agree on `invoices`');
  });
});
