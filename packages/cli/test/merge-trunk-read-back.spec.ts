import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile } from './support/billing-module-file';
import { KEPT, merged, tablesFile } from './support/declared-tables-file';

const LINES = 'generated registry: the lines of both sides kept';
const TODO = '  // TODO(domain): add one column per field.';

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

/** A tables file whose declarations follow one another with no blank line. */
function packed(...declarations: readonly (readonly string[])[]): string {
  return ['// ddd-ts-kit:tables', ...declarations.flat(), '// /ddd-ts-kit:tables', ''].join('\n');
}

describe('merge-trunk, reading back the lines of both sides of a region whose brackets pair', () => {
  it('keeps the column of the trunk in its table when the branch wrote another table in the place of the one above it', () => {
    const settled = merged({
      base: tablesFile([T('orders'), T('payments', col('x')), T('shipments', col('y'))]),
      ours: tablesFile([T('ledgers', col('z')), T('orders'), T('shipments', col('y'))]),
      theirs: tablesFile([T('orders', col('c5')), T('payments', col('x')), T('shipments', col('y'))]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT, blocks: [] });

    expect(settled.content).toBe(
      tablesFile([T('ledgers', col('z')), T('orders', col('c5')), T('shipments', col('y'))]),
    );
  });

  it('keeps the column of the branch in its table when the trunk wrote another table above it', () => {
    const settled = merged({
      base: tablesFile([T('orders'), T('payments', col('x')), T('shipments')]),
      ours: tablesFile([T('orders', col('c4')), T('payments', col('x')), T('shipments')]),
      theirs: tablesFile([T('settlements', col('x')), T('orders'), T('shipments')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT, blocks: [] });
    expect(settled.content).toBe(tablesFile([T('settlements', col('x')), T('orders', col('c4')), T('shipments')]));
  });

  it('does not write back a table the branch removed and the trunk only moved', () => {
    const settled = merged({
      base: packed(T('b1', col('x')), T('b2', TODO), T('b3', TODO, col('x'))),
      ours: packed(T('b2', TODO)),
      theirs: packed(['// about b2'], T('b2', TODO, col('c4')), T('b1', col('x')), T('b3', TODO, col('x'))),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT, blocks: [] });
    expect(settled.content).toBe(packed(['// about b2'], T('b2', TODO, col('c4'))));
  });

  it('keeps above its declaration the comment a side wrote there, the other side adding a table in between', () => {
    const documented = ['/**', ' * The orders of billing.', ' */', ...T('orders')];

    const settled = merged({
      base: tablesFile([T('payments'), T('orders')]),
      ours: tablesFile([T('payments'), documented]),
      theirs: tablesFile([T('payments'), T('ledgers', col('amount')), T('orders')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([T('payments'), T('ledgers', col('amount')), documented]));
  });

  it('keeps above its declaration a line comment the compiler reads', () => {
    const expected = ['// @ts-expect-error the column is added by the next migration', ...T('orders')];

    const settled = merged({
      base: tablesFile([T('payments'), T('orders')]),
      ours: tablesFile([T('payments'), expected]),
      theirs: tablesFile([T('payments'), T('ledgers', col('amount')), T('orders')]),
    });

    expect(settled).toMatchObject({ settled: true, how: KEPT });
    expect(settled.content).toBe(tablesFile([T('payments'), T('ledgers', col('amount')), expected]));
  });
});

describe('merge-trunk, in a region the kit does not read with certainty', () => {
  const withoutComment = (lines: readonly string[]): string[] => lines.filter((line) => !line.includes('TODO(domain)'));

  it.each([
    ['a regular expression', ['export const code = /^[A-Z]+$/;']],
    ['a constant and a type of one name', ['export const Kind = 1;', 'export type Kind = number;']],
    [
      'an interface and a constant of one name',
      ['export interface Row {', '  id: string;', '}', 'export const Row = {};'],
    ],
    [
      'the signatures of one function',
      [
        'export function find(id: string): Row;',
        'export function find(id: number): Row;',
        'export function find(id: unknown): Row {',
        '  return row(id);',
        '}',
      ],
    ],
    ['one statement written twice', ['registerTables();', 'registerTables();']],
    ['a region written inside it', ['// ddd-ts-kit:indexes', 'export const byId = index();', '// /ddd-ts-kit:indexes']],
  ])('keeps the lines of both sides, as it always did, where the region holds %s', (_, unread) => {
    const settled = merged({
      base: tablesFile([unread, stored('orders')]),
      ours: tablesFile([unread, stored('orders', col('total')), stored('invoices')]),
      theirs: tablesFile([unread, withoutComment(stored('orders'))]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });

    expect(settled.content).toBe(
      tablesFile([unread, withoutComment(stored('orders', col('total'))), stored('invoices')]),
    );
  });
});

describe('merge-trunk, in a region of entries of a list', () => {
  /** The index of the tables of the application, each an entry of one list. */
  function index(...entries: readonly string[]): string {
    return [
      'export const entities = [',
      '  // ddd-ts-kit:schemas',
      ...entries.map((entry) => `  ${entry},`),
      '  // /ddd-ts-kit:schemas',
      '];',
      '',
    ].join('\n');
  }

  it('keeps the lines of both sides when one side added the entry of the other and one more', () => {
    const settled = merged(
      { base: index('orders'), ours: index('orders', 'invoices'), theirs: index('orders', 'invoices', 'refunds') },
      'src/platform/database/schema.ts',
    );

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });
    expect(settled.content).toBe(index('orders', 'invoices', 'refunds'));
  });

  it('keeps the lines of both sides when each side added an entry of its own', () => {
    const settled = merged(
      { base: index('orders'), ours: index('orders', 'invoices'), theirs: index('orders', 'refunds') },
      'src/platform/database/schema.ts',
    );

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });
    expect(settled.content).toBe(index('orders', 'invoices', 'refunds'));
  });
});

describe('merge-trunk, in a region of statements that declare no name', () => {
  const one = (name: string, more = ''): string[] => [
    `  platform.commands.register(${name}Command, new ${name}Handler(platform.database${more}), { context: 'billing' });`,
  ];

  const wide = (name: string, given = 'platform.database', ...more: readonly string[]): string[] => [
    '  platform.commands.register(',
    `    ${name}Command,`,
    `    new ${name}Handler(${given}),`,
    ...more.map((argument) => `    ${argument},`),
    "    { context: 'billing' },",
    '  );',
  ];

  /** The statements of the region, a blank line between two of them. */
  const spaced = (...statements: readonly (readonly string[])[]): string =>
    moduleFile(...statements.flatMap((statement, at) => (at === 0 ? [statement] : [[''], statement])));

  const REPOSITORY = ['  const refundRepository = new Store(platform.database);'];

  it('keeps the lines of both sides in the order of those lines when no statement reads one set below it', () => {
    const settled = merged(
      {
        base: spaced(one('Place'), one('Cancel'), wide('Refund'), one('Ship')),
        ours: spaced(one('Place'), wide('Refund'), one('Ship'), one('Cancel')),
        theirs: spaced(
          one('Place'),
          one('Cancel'),
          REPOSITORY,
          wide('Refund', 'refundRepository'),
          one('Ship', ', carrier'),
        ),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });

    expect(settled.content).toBe(
      moduleFile(
        one('Place'),
        [''],
        REPOSITORY,
        wide('Refund', 'refundRepository'),
        ['', ''],
        one('Cancel'),
        one('Ship', ', carrier'),
      ),
    );
  });

  it('keeps them too when each side set the statements in an order of its own', () => {
    const settled = merged(
      {
        base: spaced(wide('Place'), one('Cancel'), one('Ship'), wide('Refund', 'platform.database', 'limit')),
        ours: spaced(
          wide('Place'),
          wide('Refund', 'platform.database', 'limit', 'mine'),
          one('Cancel', ', reason'),
          one('Ship'),
        ),
        theirs: spaced(
          one('Cancel'),
          one('Ship'),
          wide('Refund', 'platform.database', 'limit', 'other'),
          wide('Place'),
        ),
      },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: LINES, blocks: [] });

    expect(settled.content).toBe(
      moduleFile(
        [''],
        wide('Refund', 'platform.database', 'limit', 'mine', 'other'),
        [''],
        wide('Place'),
        [''],
        one('Cancel', ', reason'),
        [''],
        one('Ship'),
      ),
    );
  });
});

describe('merge-trunk, on a declaration one side removed and the other changed', () => {
  const ADVICE =
    'the two sides do not agree in the region `tables`: for each hunk, write the one declaration that keeps the intent of both, whole, or remove it.';

  it('says that a declaration of the side that removed it may be the same one under another name, when that side wrote one', () => {
    const left = merged({
      base: tablesFile([T('orders'), stored('payments')]),
      ours: tablesFile([T('orders'), stored('invoices')]),
      theirs: tablesFile([T('orders'), stored('payments', col('amount'))]),
    });

    expect(left.settled).toBe(false);

    expect(left.advice).toBe(
      `${ADVICE} If a declaration of the side that removed it is this one under another name, write the change there and remove the hunk.`,
    );
  });

  it('says no more than what to write when that side wrote no other declaration, whichever side removed it', () => {
    const removed = tablesFile([T('orders')]);
    const changed = tablesFile([T('orders'), T('payments', TODO, col('amount'))]);
    const base = tablesFile([T('orders'), T('payments', TODO)]);

    expect(merged({ base, ours: removed, theirs: changed }).advice).toBe(ADVICE);
    expect(merged({ base, ours: changed, theirs: removed }).advice).toBe(ADVICE);
  });

  it('says it when the trunk is the side that removed it and wrote another', () => {
    const left = merged({
      base: tablesFile([T('orders'), stored('payments')]),
      ours: tablesFile([T('orders'), stored('payments', col('amount'))]),
      theirs: tablesFile([T('orders'), stored('invoices')]),
    });

    expect(left.advice).toContain('under another name');
  });
});
