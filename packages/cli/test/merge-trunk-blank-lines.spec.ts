import { describe, expect, it } from 'vitest';
import { mergedRegion } from '../src/merge/declarations/merged-region';
import { MODULE_FILE } from './support/billing-module-file';
import { merged, TABLES_FILE, tablesFile } from './support/declared-tables-file';
import { mergeRepository } from './support/merge-repository';

const LINES = 'generated registry: the lines of both sides kept';

/** A table of several lines. */
function T(name: string, ...columns: readonly string[]): string[] {
  return [`export const ${name} = tbl('${name}', {`, '  id: col(),', ...columns, '  version: col(),', '});'];
}

/** A route as an entry of a list: a comma ends it, no statement does. */
function route(name: string): string {
  return `    route(${name}Command, new ${name}Handler(platform.database), { context: 'billing' }),`;
}

/** The routes of billing, these lines in their region. */
function routesFile(...lines: readonly string[]): string {
  return [
    'export function routesOf(platform: Platform): Route[] {',
    '  return [',
    '    // ddd-ts-kit:routes',
    ...lines,
    '    // /ddd-ts-kit:routes',
    '  ];',
    '}',
    '',
  ].join('\n');
}

/** The routes of these commands, a blank line between two. */
function apart(...names: readonly string[]): string {
  return routesFile(...names.flatMap((name, at) => (at === 0 ? [route(name)] : ['', route(name)])));
}

describe('merge-trunk, in a region of entries set apart by blank lines', () => {
  it('keeps the lines of both sides when each side set the entries in an order of its own', () => {
    const settled = merged(
      { base: apart('A', 'B', 'C', 'D'), ours: apart('A', 'C', 'D', 'B'), theirs: apart('B', 'C', 'D', 'A') },
      MODULE_FILE,
    );

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(routesFile('', route('C'), '', route('D'), '', route('B'), route('A')));
  });

  it('keeps them when both sides removed one entry and one set the others in another order', () => {
    const settled = merged({ base: apart('A', 'B', 'C'), ours: apart('B', 'C'), theirs: apart('C', 'B') }, MODULE_FILE);

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(routesFile(route('C'), route('B')));
  });
});

describe('merge-trunk, on a comment set apart from its declaration by a blank line', () => {
  it('keeps the lines of both sides, which hold the comment right above the declaration', () => {
    const changed = T('orders').map((line) => (line === '  id: col(),' ? "  id: col('uuid')," : line));
    const above = ['export function rowsOf(): number {', '  return 1;', '}'];

    const settled = merged({
      base: tablesFile([T('orders')]),
      ours: tablesFile([above, changed]),
      theirs: tablesFile([['/** about */', '', ...T('orders')], ['register(orders);']]),
    });

    expect(settled).toMatchObject({ settled: true, how: LINES });
    expect(settled.content).toBe(tablesFile([above, ['/** about */', ...changed], ['register(orders);']]));
  });
});

describe('merge-trunk, on a statement that declares no name and that both sides removed', () => {
  it('says so when the region is not merged by declaration', () => {
    const sides = {
      base: tablesFile([T('orders'), ['register(orders);']]),
      ours: tablesFile([T('orders', '  total: col(),')]),
      theirs: tablesFile([T('orders', '  amount: col(),')]),
    };

    const top = mergeRepository({ base: {}, ours: {}, theirs: {} });
    const labels = { ours: '<<<<<<< HEAD', base: '||||||| base', theirs: '>>>>>>> main' };
    const outcome = mergedRegion('tables', { file: TABLES_FILE, binary: false, ...sides }, { top, labels, blocks: 1 });

    expect(outcome).toEqual({
      lines: undefined,
      held: {
        blocks: 1,
        advice:
          'the region `tables` holds a statement that declares no name and that both sides removed, which the kit does not merge, and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed.',
      },
    });
  });
});
