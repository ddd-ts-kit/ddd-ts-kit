import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile, registeredOnLines, REPOSITORY } from './support/billing-module-file';
import {
  INVOICES,
  KEPT,
  merged,
  mergedTables,
  ORDERS,
  REFUNDS,
  table,
  tablesFile,
  tablesOf,
} from './support/declared-tables-file';

const UNNAMED =
  'the region `handlers` holds a statement that declares no name and that one side changed or removed, which the kit does not merge, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed.';

describe('merge-trunk, where what the trunk alone brings is placed', () => {
  it('keeps a constant the trunk declared at the top of the tables above the table that uses it', () => {
    const amount = ["export const amountColumn = integer('amount').notNull();"];
    const priced = [...ORDERS.slice(0, -1), '  amount: amountColumn,', '});'];

    // git merges this edit alone in most shapes; the merge of the declarations places it the same way when it does not.
    const lines = mergedTables({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, INVOICES]),
      theirs: tablesFile([amount, priced, REFUNDS]),
    });

    expect(lines).toEqual(tablesOf([amount, priced, REFUNDS, INVOICES]));
  });

  it('keeps a constant the trunk declared at the top of the handlers above its use, each registration whole', () => {
    const traced = [
      "  const tracer = platform.tracerFor('billing');",
      '  const orderRepository = new DrizzleOrderRepository(platform.database, tracer);',
    ];

    const settled = merged(
      {
        base: moduleFile(REPOSITORY, registeredOnLines('PlaceOrder')),
        ours: moduleFile(REPOSITORY, registeredOnLines('PlaceOrder'), registeredOnLines('CancelOrder')),
        theirs: moduleFile(traced, registeredOnLines('PlaceOrder'), registeredOnLines('RefundOrder')),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      moduleFile(
        traced,
        registeredOnLines('PlaceOrder'),
        registeredOnLines('RefundOrder'),
        registeredOnLines('CancelOrder'),
      ),
    );
  });
});

describe('merge-trunk, on a statement that declares no name', () => {
  it('never keeps two versions of one registration both sides changed: the region is left as git wrote it', () => {
    const left = merged(
      {
        base: moduleFile(REPOSITORY, registeredOnLines('PlaceOrder')),
        ours: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder', 'new PlaceOrderHandler(orderRepository, platform.clock, platform.ids)'),
          registeredOnLines('CancelOrder'),
        ),
        theirs: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder', undefined, "{ context: 'billing', audited: true }"),
          registeredOnLines('RefundOrder'),
        ),
      },
      MODULE_FILE,
    );

    expect(left).toMatchObject({ settled: false, content: undefined, advice: UNNAMED });
    expect(left.blocks.length).toBeGreaterThan(0);
  });

  it('keeps once a registration both sides added alike, with the one each added', () => {
    const settled = merged(
      {
        base: moduleFile(REPOSITORY, registeredOnLines('PlaceOrder')),
        ours: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder'),
          registeredOnLines('PayOrder'),
          registeredOnLines('CancelOrder'),
        ),
        theirs: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder'),
          registeredOnLines('PayOrder'),
          registeredOnLines('RefundOrder'),
        ),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      moduleFile(
        REPOSITORY,
        registeredOnLines('PlaceOrder'),
        registeredOnLines('PayOrder'),
        registeredOnLines('RefundOrder'),
        registeredOnLines('CancelOrder'),
      ),
    );
  });
});

describe('merge-trunk, on a declaration written on lines that end with a comma', () => {
  it('keeps an entity whose type arguments are wrapped whole when the trunk edits its last lines', () => {
    const entity = (name: string, ...options: readonly string[]): string[] => [
      `export const ${name} = new EntitySchema<`,
      '  OrderRow,',
      '  OrderRowRelations',
      '>({',
      `  tableName: '${name}',`,
      '  columns: {',
      "    id: { type: 'text', primary: true },",
      '  },',
      ...options,
      '});',
    ];

    const edited = entity('orders', "  orderBy: { id: 'ASC' },");

    const lines = mergedTables({
      base: tablesFile([entity('orders')]),
      ours: tablesFile([entity('orders'), entity('invoices')]),
      theirs: tablesFile([edited, entity('refunds')]),
    });

    expect(lines).toEqual(tablesOf([edited, entity('refunds'), entity('invoices')]));
  });

  it('keeps two constants declared in one statement together', () => {
    const pair = (name: string): string[] => [
      `export const ${name}Id = text('${name}_id'),`,
      `  ${name}At = text('${name}_at');`,
    ];

    const settled = merged({
      base: tablesFile([pair('order'), ORDERS]),
      ours: tablesFile([pair('order'), ORDERS, INVOICES]),
      theirs: tablesFile([pair('order'), ORDERS, REFUNDS]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([pair('order'), ORDERS, REFUNDS, INVOICES]));
  });
});

describe('merge-trunk, in a region written without semicolons nor blank lines', () => {
  it('keeps each table whole: a line that declares another name starts another declaration', () => {
    const bare = (name: string): string[] => [
      `export const ${name} = billingSchema.table('${name}', {`,
      "  id: text('id'),",
      '})',
    ];

    const file = (...names: readonly string[]): string =>
      ['// ddd-ts-kit:tables', ...names.flatMap(bare), '// /ddd-ts-kit:tables', ''].join('\n');

    const settled = merged({
      base: file('orders'),
      ours: file('orders', 'invoices'),
      theirs: file('orders', 'refunds'),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(file('orders', 'refunds', 'invoices'));
  });
});

describe('merge-trunk, on a table both sides changed while both add one', () => {
  it('takes the merge of its lines when they merge without a conflict', () => {
    const ours = table('orders', "  total: integer('total').notNull(),");
    const theirs = [...ORDERS.slice(0, -1), "  placedAt: text('placed_at'),", '});'];
    const both = [...ours.slice(0, -1), "  placedAt: text('placed_at'),", '});'];

    const lines = mergedTables({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ours, INVOICES]),
      theirs: tablesFile([theirs, REFUNDS]),
    });

    expect(lines).toEqual(tablesOf([both, REFUNDS, INVOICES]));
  });

  it('leaves it as one hunk of its three versions when its lines do not merge', () => {
    const ours = table('orders', "  total: integer('total').notNull(),");
    const theirs = table('orders', "  amount: integer('amount').notNull(),");

    const lines = mergedTables({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ours, INVOICES]),
      theirs: tablesFile([theirs, REFUNDS]),
    });

    expect(lines).toEqual(
      tablesOf([
        ['<<<<<<< HEAD', ...ours, '||||||| base', ...ORDERS, '=======', ...theirs, '>>>>>>> main'],
        REFUNDS,
        INVOICES,
      ]),
    );
  });
});
