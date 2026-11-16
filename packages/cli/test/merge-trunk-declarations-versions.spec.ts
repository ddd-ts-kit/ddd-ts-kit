import { describe, expect, it } from 'vitest';
import { MODULE_FILE, moduleFile, registeredOnLines, REPOSITORY } from './support/billing-module-file';
import { merged, ORDERS, REFUNDS, table, tablesFile } from './support/declared-tables-file';
import type { ThreeSides } from './support/three-way-path';

const TWICE =
  'the region `handlers` holds two statements with no declared name that open alike, one holding every line of the other, which the kit cannot tell from one statement written twice, and its hunks show lines, not whole statements: write it once if it is one statement, each whole if they are two.';

const UNNAMED =
  'the region `handlers` holds a statement that declares no name and that one side changed or removed, which the kit does not merge, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed.';

/** The same merge seen from the other side. */
function mirrored({ base, ours, theirs }: ThreeSides): ThreeSides {
  return { base, ours: theirs, theirs: ours };
}

/** A region of statements written at the top level of a file. */
function region(...lines: readonly string[]): string {
  return ['// ddd-ts-kit:handlers', ...lines, '// /ddd-ts-kit:handlers', ''].join('\n');
}

describe('merge-trunk, on two versions of a table one of which holds every line of the other', () => {
  it('leaves one hunk on a table both sides added, one with one more column, whichever side it is', () => {
    const more = table('invoices', "  total: integer('total').notNull(),");
    const less = table('invoices');
    const sides = { base: tablesFile([ORDERS]), ours: tablesFile([ORDERS, more]), theirs: tablesFile([ORDERS, less]) };

    for (const [given, ours, theirs] of [
      [sides, more, less],
      [mirrored(sides), less, more],
    ] as const) {
      const left = merged(given);

      expect(left.settled).toBe(false);
      expect(left.blocks).toHaveLength(1);
      expect(left.blocks[0]).toMatchObject({ ours, base: [], theirs });
      expect(left.advice).toContain('do not agree on `invoices` in the region `tables`');
    }
  });

  it('never writes back a column one side removed from a table the other added a column to', () => {
    const legacy = "  legacy: text('legacy'),";

    const sides = {
      base: tablesFile([ORDERS, table('invoices', legacy)]),
      ours: tablesFile([ORDERS, table('invoices'), REFUNDS]),
      theirs: tablesFile([ORDERS, table('invoices', legacy, "  b: text('b'),"), table('payments')]),
    };

    for (const given of [sides, mirrored(sides)]) {
      const left = merged(given);

      expect(left.settled).toBe(false);
      expect(left.blocks).toHaveLength(1);
      expect(left.blocks[0]?.base).toEqual(table('invoices', legacy));
      expect(left.advice).toContain('do not agree on `invoices` in the region `tables`');
    }
  });
});

describe('merge-trunk, on two versions of a statement that declares no name', () => {
  it('writes nothing when both added a registration, one with one more line: one statement or two, nothing says', () => {
    const whole = registeredOnLines('PlaceOrder');
    const short = whole.filter((line) => !line.includes('{ context'));

    const sides = {
      base: moduleFile(REPOSITORY),
      ours: moduleFile(REPOSITORY, whole),
      theirs: moduleFile(REPOSITORY, short),
    };

    for (const given of [sides, mirrored(sides)]) {
      expect(merged(given, MODULE_FILE)).toMatchObject({ settled: false, content: undefined, advice: TWICE });
    }
  });

  it('writes nothing when one side added two registrations and the other one that holds them both', () => {
    const call = (...commands: readonly string[]): string[] => [
      '  platform.commands.register(',
      ...commands.map((command) => `    ${command},`),
      '  );',
    ];

    const left = merged(
      {
        base: moduleFile(REPOSITORY),
        ours: moduleFile(REPOSITORY, call('A'), call('A', 'B')),
        theirs: moduleFile(REPOSITORY, call('A', 'B', 'C')),
      },
      MODULE_FILE,
    );

    expect(left).toMatchObject({ settled: false, content: undefined, advice: TWICE });
  });

  it('never writes back a line one side removed from a registration of the base', () => {
    const call = (...commands: readonly string[]): string[] => [
      '  platform.commands.register(',
      ...commands.map((command) => `    ${command},`),
      '  );',
    ];

    const sides = {
      base: moduleFile(REPOSITORY, call('A', 'B', 'C')),
      ours: moduleFile(REPOSITORY, call('A', 'C'), registeredOnLines('SendRefund')),
      theirs: moduleFile(REPOSITORY, call('A', 'B', 'C'), registeredOnLines('VoidRefund')),
    };

    for (const given of [sides, mirrored(sides)]) {
      expect(merged(given, MODULE_FILE)).toMatchObject({ settled: false, content: undefined, advice: UNNAMED });
    }
  });
});

describe('merge-trunk, on two versions of a named declaration whose lines are the same in another place', () => {
  it('leaves one hunk on a function whose statement one side moved to another branch', () => {
    const ours = ['function boot() {', '  if (ready) {', '    run();', '  }', '}'];
    const theirs = ['function boot() {', '  if (ready) {', '  } else {', '    run();', '  }', '}'];
    const left = merged({ base: region(), ours: region(...ours), theirs: region(...theirs) }, MODULE_FILE);

    expect(left.settled).toBe(false);
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, theirs });
    expect(left.advice).toContain('do not agree on `boot` in the region `handlers`');
  });

  it('leaves one hunk on an object whose column one side wrote under another key', () => {
    const shape = (left: readonly string[], right: readonly string[]): string[] => [
      'export const shape = {',
      '  left: {',
      ...left,
      '  },',
      '  right: {',
      ...right,
      '  },',
      '};',
    ];

    const ours = shape(['    total: 1,'], []);
    const theirs = shape([], ['    total: 1,']);
    const left = merged({ base: region(), ours: region(...ours), theirs: region(...theirs) }, MODULE_FILE);

    expect(left.settled).toBe(false);
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, theirs });
  });
});

describe('merge-trunk, on the default export of a module', () => {
  it('writes nothing when each side gives the file one, in either spelling', () => {
    const left = merged(
      {
        base: region('const first = 1;', 'const second = 2;'),
        ours: region('const first = 1;', 'const second = 2;', 'export { first as default };', ...boot('one')),
        theirs: region('const first = 1;', 'const second = 2;', 'export default second;', ...boot('two')),
      },
      MODULE_FILE,
    );

    expect(left).toMatchObject({
      settled: false,
      content: undefined,
      advice:
        'the region `handlers` holds a default export of each side, and a file has one: write the one the file keeps, whole, and export what the other side declared under a name.',
    });
  });

  it('leaves one hunk on a function one side exports as the default and the other by its name', () => {
    const ours = ['export default function start() {', '  run();', '}'];
    const theirs = ['export function start() {', '  run();', '}'];
    const left = merged({ base: region(), ours: region(...ours), theirs: region(...theirs) }, MODULE_FILE);

    expect(left.settled).toBe(false);
    expect(left.blocks).toHaveLength(1);
    expect(left.blocks[0]).toMatchObject({ ours, theirs });
    expect(left.advice).toContain('do not agree on `start` in the region `handlers`');
  });
});

/** A function of several lines each side adds under its own name: what leaves the union of the lines open. */
function boot(name: string): string[] {
  return [`function ${name}() {`, '  run();', '}'];
}
