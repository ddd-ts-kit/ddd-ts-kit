import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile, registered, REPOSITORY } from './support/billing-module-file';
import { KEPT, merged, ORDERS, tablesFile } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';
const BASE = [REPOSITORY, registered('PlaceOrder')];

/** A chain written on several lines, no bracket open from one line to the next. */
function chain(event: string, last = '    .start();'): string[] {
  return ['  platform.events', `    .on('${event}', handle)`, last];
}

/** A call written on several lines whose first and last lines are its own. */
function call(name: string): string[] {
  return [`  register${name}(platform,`, '    orderRepository,', `    '${name}');`];
}

/** A constant under a comment written on several lines. */
function documented(name: string, meaning = `The limit of ${name}.`): string[] {
  return ['/**', ` * ${meaning}`, ' */', `export const ${name} = 1;`];
}

/** The module of billing with these statements in its region, each side adding its own to the base. */
function withAdded(ours: readonly (readonly string[])[], theirs: readonly (readonly string[])[]) {
  return merged(
    { base: moduleFile(...BASE), ours: moduleFile(...BASE, ...ours), theirs: moduleFile(...BASE, ...theirs) },
    MODULE_FILE,
  );
}

describe('merge-trunk, when each side added a statement written on several lines with no bracket across them', () => {
  it('keeps both chains whole, where the lines of both sides would leave the second without its first and last lines', () => {
    const settled = withAdded([chain('placed')], [chain('paid')]);

    expect(settled).toMatchObject({ settled: true, how: KEPT, blocks: [] });
    expect(settled.content).toBe(moduleFile(...BASE, chain('paid'), chain('placed')));
  });

  it('keeps both chains whole when they share their first line alone', () => {
    const settled = withAdded([chain('placed', '    .start(1);')], [chain('paid', '    .start(2);')]);

    expect(settled).toMatchObject({ settled: true, how: KEPT });

    expect(settled.content).toBe(
      moduleFile(...BASE, chain('paid', '    .start(2);'), chain('placed', '    .start(1);')),
    );
  });

  it('keeps both calls whole, where the second would lose the argument line it shares with the first', () => {
    const settled = withAdded([call('Orders')], [call('Refunds')]);

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(moduleFile(...BASE, call('Refunds'), call('Orders')));
  });

  it('keeps once a chain both sides added alike, with the registration each added: the lines of both sides', () => {
    const settled = withAdded([chain('placed'), registered('CancelOrder')], [chain('placed'), registered('ShipOrder')]);

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      moduleFile(...BASE, chain('placed'), registered('CancelOrder'), registered('ShipOrder')),
    );
  });

  it('keeps the lines of both sides of statements that each hold on one line, a comment both wrote kept once', () => {
    const settled = withAdded(
      [registered('CancelOrder'), ['  // Shipping.'], registered('ShipOrder')],
      [registered('CancelOrder'), ['  // Shipping.'], registered('RefundOrder')],
    );

    expect(settled).toMatchObject({ settled: true, how: LINES });

    expect(settled.content).toBe(
      moduleFile(
        ...BASE,
        registered('CancelOrder'),
        ['  // Shipping.'],
        registered('ShipOrder'),
        registered('RefundOrder'),
      ),
    );
  });

  it('leaves to a person a function in which each side added a chain: one hunk, its three versions whole', () => {
    const table = (...columns: readonly string[]): string[] => [
      'function createOrderTable(knex: Knex): Promise<void> {',
      "  return knex.schema.createTable('orders', (table) => {",
      "    table.text('id').primary();",
      ...columns,
      "    table.integer('version').notNullable();",
      '  });',
      '}',
    ];

    const column = (name: string): string[] => [
      '    table',
      `      .decimal('${name}', 12, 2)`,
      '      .notNullable();',
    ];

    const ours = table(...column('total'));
    const theirs = table(...column('amount'));
    const left = merged({ base: tablesFile([table()]), ours: tablesFile([ours]), theirs: tablesFile([theirs]) });

    expect(left).toMatchObject({
      settled: false,
      advice:
        'the two sides do not agree on `createOrderTable` in the region `tables`: for each, write the one declaration that keeps the intent of both, whole, or remove it.',
    });

    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, base: table(), theirs });
  });
});

describe('merge-trunk, when each side added a declaration under a comment or a decorator', () => {
  it('keeps each constant under its whole comment, where the second comment would lose its first and last lines', () => {
    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, documented('ORDERS_LIMIT')]),
      theirs: tablesFile([ORDERS, documented('REFUNDS_LIMIT')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([ORDERS, documented('REFUNDS_LIMIT'), documented('ORDERS_LIMIT')]));
  });

  it('keeps the lines of both sides when both wrote one comment above the constant each added', () => {
    const ours = documented('ORDERS_LIMIT', 'A limit of billing.');
    const theirs = documented('REFUNDS_LIMIT', 'A limit of billing.');

    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, ours]),
      theirs: tablesFile([ORDERS, theirs]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([ORDERS, [...ours, ...theirs.slice(3)]]));
  });

  it('keeps each class under its decorator, where the second would lose the one both wrote alike', () => {
    const decorated = (name: string): string[] => ['@Injectable()', `export class ${name} {}`];

    const settled = merged({
      base: tablesFile([ORDERS]),
      ours: tablesFile([ORDERS, decorated('OrderReader')]),
      theirs: tablesFile([ORDERS, decorated('RefundReader')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([ORDERS, decorated('RefundReader'), decorated('OrderReader')]));
  });
});
