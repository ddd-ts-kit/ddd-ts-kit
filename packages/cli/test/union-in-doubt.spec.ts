import { describe, expect, it } from 'vitest';
import type { ConflictBlock } from '../src/merge/conflict-blocks';
import { declarationsOf } from '../src/merge/declarations/declarations-of';
import { linesOfBothSides } from '../src/merge/declarations/lines-of-both-sides';
import { unionInDoubt } from '../src/merge/declarations/union-in-doubt';
import { unionReadsAsMerged } from '../src/merge/declarations/union-reads-as-merged';
import { mergeRepository } from './support/merge-repository';

const CODE = { region: 'handlers', prisma: false };

function block(sides: { ours: readonly string[]; base?: readonly string[]; theirs: readonly string[] }): ConflictBlock {
  return { kind: 'conflict', base: [], ...sides, raw: [], line: 1 };
}

function inDoubt(ours: readonly string[], theirs: readonly string[], base: readonly string[] = []): boolean {
  return unionInDoubt(block({ ours, base, theirs }), CODE);
}

describe('the union of the lines of a conflict', () => {
  it('is not in doubt when each side holds statements of one line, a line comment or a blank line among them', () => {
    expect(
      inDoubt(['  register(a);', '', '  // Shared.', '  register(b);'], ['  register(a);', '  register(c);']),
    ).toBe(false);

    expect(inDoubt(["  a: text('a'),"], ["  b: text('b'),", '  /** The total. */', "  total: text('total'),"])).toBe(
      false,
    );
  });

  it('is not in doubt when a side holds a whole table with a line comment among its columns', () => {
    const table = (name: string): string[] => [
      `const ${name} = table({`,
      '  id,',
      '  // What is left to write.',
      '});',
    ];

    expect(inDoubt(table('invoices'), ['const limit = 1;'])).toBe(false);
    expect(inDoubt(['const limit = 1;'], table('refunds'))).toBe(false);
  });

  it('is in doubt when a side opens a bracket it does not close, or closes one it did not open', () => {
    expect(inDoubt(['  a,', '});', '', 'export const invoices = table({'], ['  b,'])).toBe(true);
    expect(inDoubt(['  a,'], ['export const invoices = table({', '  id,'])).toBe(true);
    expect(inDoubt(['  a,'], ['  b,'], ['});'])).toBe(true);
    expect(inDoubt(['  a,'], ['  b,'], ['register('])).toBe(true);
  });

  it('is in doubt when it keeps once a line two different statements written on several lines share', () => {
    expect(
      inDoubt(
        ['  table', "    .decimal('a')", '    .notNullable();'],
        ['  table', "    .decimal('b')", '    .notNullable();'],
      ),
    ).toBe(true);

    expect(inDoubt(['  call(a,', '    shared,', '    1);'], ['  call(b,', '    shared,', '    2);'])).toBe(true);
    expect(inDoubt(['/**', ' * A.', ' */', 'const a = 1;'], ['/**', ' * B.', ' */', 'const b = 2;'])).toBe(true);
    expect(inDoubt(['@Injectable()', 'class A {}'], ['@Injectable()', 'class B {}'])).toBe(true);
    expect(inDoubt(['const total =', '  compute();', 'const a = 1;'], ['const amount =', '  compute();'])).toBe(true);
    expect(inDoubt(['  call(a, {', '', '    shared,', '  });'], ['  call(b, {', '    shared,', '  });'])).toBe(true);
  });

  it('is not in doubt when both sides wrote such a statement alike, or when a side left the one of the base', () => {
    const chain = ['  table', "    .decimal('a')", '    .notNullable();'];
    const comment = ['/**', ' * The limits.', ' */'];

    expect(inDoubt([...chain, '  one();'], [...chain, '  two();'])).toBe(false);
    expect(inDoubt([...comment, 'const a = 1;'], [...comment, 'const b = 2;'])).toBe(false);
    expect(inDoubt([...chain, '  one();'], ['  two();'], chain)).toBe(false);

    expect(
      inDoubt(['  ...routes([', '    a,', '  ]),', '  ...one(),'], ['  ...routes([', '    a,', '  ]),', '  ...two(),']),
    ).toBe(false);

    expect(inDoubt(['  one();'], [...chain, '  two();'], chain)).toBe(false);
  });

  it('is in doubt when the trunk changed a line of a statement the branch kept as the base holds it', () => {
    const call = ['  call(a,', '    shared,', '    1);'];

    expect(inDoubt([...call, '  one();'], ['  call(a,', '    shared,', '    2);'], call)).toBe(true);
  });

  it('reads each line of a schema of Prisma as a statement', () => {
    const prisma = { region: 'models', prisma: true };
    const ours = ['  @@index([total])', '  total Int'];
    const theirs = ['  @@index([total])', '  amount Int'];

    expect(unionInDoubt(block({ ours, theirs }), prisma)).toBe(false);
    expect(unionInDoubt(block({ ours, theirs }), CODE)).toBe(true);
  });
});

describe('the lines the kit keeps of one declaration both sides changed', () => {
  const top = mergeRepository({ base: {}, ours: {}, theirs: {} });

  const table = (...columns: readonly string[]): string[] => [
    'const orders = table({',
    '  id,',
    ...columns,
    '  version,',
    '});',
  ];

  it('are what git merges, and the lines of both sides of each conflict left', () => {
    expect(linesOfBothSides(top, { ours: table('  a,'), base: table(), theirs: table('  b,') }, CODE)).toEqual(
      table('  a,', '  b,'),
    );

    expect(
      linesOfBothSides(
        top,
        {
          ours: ['const orders = table({', '  id,', '  version,', '}, indexes);'],
          base: table(),
          theirs: table('  b,'),
        },
        CODE,
      ),
    ).toEqual(['const orders = table({', '  id,', '  b,', '  version,', '}, indexes);']);
  });

  it('are not known when a conflict is in doubt, or when git does not merge the versions', () => {
    const chain = (name: string): string[] => ['  table', `    .decimal('${name}')`, '    .notNullable();'];
    const call = (name: string): string[] => ['  register(', `    ${name},`, '  );'];

    expect(
      linesOfBothSides(top, { ours: table(...chain('a')), base: table(), theirs: table(...chain('b')) }, CODE),
    ).toBeUndefined();

    expect(
      linesOfBothSides(top, { ours: table(...call('a')), base: table(), theirs: table(...call('b')) }, CODE),
    ).toBeUndefined();

    expect(
      linesOfBothSides('/nowhere', { ours: table('  a,'), base: table(), theirs: table('  b,') }, CODE),
    ).toBeUndefined();
  });
});

describe('the region the union of lines gives', () => {
  const read = (...lines: readonly string[]) => declarationsOf(lines) ?? { declarations: [], trailing: 0 };
  const never = (): undefined => undefined;
  const A = 'const a = 1;';
  const B = 'const b = 2;';
  const C = 'const c = 3;';

  it('reads as merged when it holds each declaration of the two sides once, in whatever order', () => {
    const sides = { ours: read(A, B), base: read(A), theirs: read(A, C) };

    expect(unionReadsAsMerged([A, B, C], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([A, C, B], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([C, A, B], sides, never)).toBe('merged');
  });

  it('reads as mixed when a declaration stands above one it reads, which every side that holds both sets above it', () => {
    const uses = 'const d = a + 1;';
    const sides = { ours: read(A, B), base: read(A), theirs: read(A, uses) };

    expect(unionReadsAsMerged([A, B, uses], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([uses, A, B], sides, never)).toBe('mixed');

    expect(
      unionReadsAsMerged(
        ["const d = 'a';", A],
        { ours: read(A), base: read(A), theirs: read(A, "const d = 'a';") },
        never,
      ),
    ).toBe('merged');

    expect(unionReadsAsMerged([uses, A], { ours: read(uses, A), base: read(A), theirs: read(A, uses) }, never)).toBe(
      'merged',
    );
  });

  it('reads as mixed when it lacks a declaration, holds one no side wrote, one a side removed, or is not read', () => {
    const sides = { ours: read(A, B), base: read(A, B), theirs: read(A) };

    expect(unionReadsAsMerged([A], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([A, B], sides, never)).toBe('mixed');
    expect(unionReadsAsMerged([], sides, never)).toBe('mixed');
    expect(unionReadsAsMerged([A, C], sides, never)).toBe('mixed');
    expect(unionReadsAsMerged([A, A], sides, never)).toBe('mixed');
    expect(unionReadsAsMerged([A], { ours: read(A, B), base: read(A), theirs: read(A) }, never)).toBe('mixed');
  });

  it('takes for a declaration both changed the lines it is given, and reads as mixed when nothing says what it is', () => {
    const changed = { ours: read('const a = 2;'), base: read(A), theirs: read('const a = 3;') };
    const added = { ours: read(A, 'const b = 1;'), base: read(A), theirs: read(A, B) };
    const removed = { ours: read(), base: read(A), theirs: read('const a = 3;') };

    expect(unionReadsAsMerged(['const a = 5;'], changed, () => ['const a = 5;'])).toBe('merged');
    expect(unionReadsAsMerged(['const a = 4;'], changed, () => ['const a = 5;'])).toBe('mixed');
    expect(unionReadsAsMerged(['const a = 2;'], changed, never)).toBe('mixed');
    expect(unionReadsAsMerged([A, B], added, never)).toBe('mixed');
    expect(unionReadsAsMerged(['const a = 3;'], removed, never)).toBe('mixed');
  });

  it('reads as merged the declarations both sides hold in any order', () => {
    const base = read(A, B, C);

    expect(unionReadsAsMerged([A, B, C], { ours: read(A, B, C), base, theirs: read(B, A, C) }, never)).toBe('merged');
    expect(unionReadsAsMerged([B, A, C], { ours: read(B, A, C), base, theirs: read(C, A, B) }, never)).toBe('merged');
  });

  it('reads a declaration with the comment the union kept once above its neighbour, when a side wrote it there too', () => {
    const note = '// A limit.';
    const sides = { ours: read(A, note, B), base: read(A), theirs: read(A, note, C) };

    expect(unionReadsAsMerged([A, note, B, C], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([A, note, C, B], sides, never)).toBe('merged');
    expect(unionReadsAsMerged([A, B, C], sides, never)).toBe('mixed');

    expect(
      unionReadsAsMerged([A, note, B, C], { ours: read(A, B), base: read(A), theirs: read(A, note, C) }, never),
    ).toBe('mixed');
  });

  it('pairs a statement that declares no name with the one of each side it merges, by their lines', () => {
    const call = (...args: readonly string[]): string[] => ['register(', ...args.map((arg) => `  ${arg},`), ');'];
    const sides = { ours: read(...call('a', 'mine')), base: read(...call('a')), theirs: read(...call('a', 'other')) };
    const both = (): string[] => call('a', 'mine', 'other');

    expect(unionReadsAsMerged(call('a', 'mine', 'other'), sides, both)).toBe('merged');
    expect(unionReadsAsMerged(call('a', 'other', 'mine'), sides, both)).toBe('mixed');
    expect(unionReadsAsMerged([...call('a', 'mine'), ...call('a', 'other')], sides, both)).toBe('merged');
    expect(unionReadsAsMerged(call('a', 'mine'), sides, both)).toBe('mixed');
  });

  it('reads as lines only the entries of a list on which the two sides differ', () => {
    const sides = {
      ours: read('  orders,', '  invoices,'),
      base: read('  orders,'),
      theirs: read('  orders,', '  invoices,', '  refunds,'),
    };

    const all = ['  orders,', '  invoices,', '  refunds,'];

    expect(unionReadsAsMerged(all, sides, never)).toBe('lines');
    expect(unionReadsAsMerged(['  orders,', '  refunds,'], sides, never)).toBe('lines');
  });

  it('reads as merged a statement of one side that the merge of the three already is', () => {
    const call = (...args: readonly string[]): string[] => ['register(', ...args.map((arg) => `  ${arg},`), ');'];
    const sides = { ours: read(...call('a', 'b')), base: read(...call('a')), theirs: read(...call('a', 'b', 'c')) };

    expect(unionReadsAsMerged(call('a', 'b', 'c'), sides, () => call('a', 'b', 'c'))).toBe('merged');
    expect(unionReadsAsMerged(call('a', 'b', 'c'), sides, never)).toBe('mixed');
  });

  it('does not try more pairings than a region of a few statements needs', () => {
    const statements = (side: string): string[] => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((at) => `${side}(${at});`);
    const sides = { ours: read(...statements('mine')), base: read(), theirs: read(...statements('other')) };

    expect(unionReadsAsMerged(statements('merged'), sides, () => ['merged(1);'])).toBe('mixed');
  });
});
