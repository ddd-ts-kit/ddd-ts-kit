import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile, registered, registeredOnLines, REPOSITORY } from './support/billing-module-file';
import { merged, ORDERS, table, tablesFile } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';

describe('merge-trunk, in a region the lines of both sides leave whole', () => {
  it('keeps the lines of both sides of one registration written on several lines, each side adding another', () => {
    const settled = merged(
      {
        base: moduleFile(REPOSITORY, registeredOnLines('PlaceOrder')),
        ours: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder', 'new PlaceOrderHandler(orderRepository, platform.clock, platform.ids)'),
          registered('CancelOrder'),
        ),
        theirs: moduleFile(
          REPOSITORY,
          registeredOnLines('PlaceOrder', undefined, "{ context: 'billing', audited: true }"),
          registered('RefundOrder'),
        ),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      moduleFile(
        REPOSITORY,
        registeredOnLines(
          'PlaceOrder',
          'new PlaceOrderHandler(orderRepository, platform.clock, platform.ids)',
          "{ context: 'billing', audited: true }",
        ),
        registered('CancelOrder'),
        registered('RefundOrder'),
      ),
    );
  });

  it('keeps one import with the name each side added to it, under its comment', () => {
    const imports = (...names: readonly string[]): string[] => [
      '// The column builders of the tables below.',
      'import {',
      ...names.map((name) => `  ${name},`),
      "} from './columns';",
    ];

    const settled = merged({
      base: tablesFile([ORDERS], imports('jsonb')),
      ours: tablesFile([ORDERS], imports('jsonb', 'boolean')),
      theirs: tablesFile([ORDERS], imports('jsonb', 'uuid')),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([ORDERS], imports('jsonb', 'boolean', 'uuid')));
  });

  it('keeps a constant the trunk declared at the top above the statement that uses it', () => {
    const traced = [
      "  const tracer = platform.tracerFor('billing');",
      '  const orderRepository = new DrizzleOrderRepository(platform.database, tracer);',
    ];

    const settled = merged(
      {
        base: moduleFile(REPOSITORY, registered('PlaceOrder')),
        ours: moduleFile(REPOSITORY, registered('PlaceOrder'), registered('CancelOrder')),
        theirs: moduleFile(traced, registered('PlaceOrder'), registered('RefundOrder')),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      moduleFile(traced, registered('PlaceOrder'), registered('CancelOrder'), registered('RefundOrder')),
    );
  });

  it('keeps the column each side added at one place of a table, and no hunk', () => {
    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([table('orders', "  total: integer('total').notNull(),")]),
      theirs: tablesFile([table('orders', "  amount: integer('amount').notNull(),")]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });

    expect(settled.content).toBe(
      tablesFile([table('orders', "  total: integer('total').notNull(),", "  amount: integer('amount').notNull(),")]),
    );
  });
});
