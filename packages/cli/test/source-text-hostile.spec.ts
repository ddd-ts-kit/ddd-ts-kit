import { describe, expect, it } from 'vitest';
import { CliError } from '../src/cli-error';
import { SourceText } from '../src/source-text';

const FILE = 'src/roles.ts';
const BY_HAND = 'Write it by hand.';

function rolesOf(...lines: readonly string[]) {
  const roles = SourceText.of(FILE, lines.join('\n')).objectAssignedTo('roles');

  if (roles === undefined) {
    throw new Error('no object of roles');
  }

  return roles;
}

function thrownBy(edit: () => unknown): unknown {
  try {
    return edit();
  } catch (error) {
    return error;
  }
}

describe('an object and its lists, read in the code of a source', () => {
  it('finds no object in a comment, a string or a declaration that is given something else', () => {
    const unread = [
      '// export const roles = { a: [] };',
      "const text = 'const roles = { a: [] }';",
      'export const roles = build({ a: [] });',
      'export const rolesOfOthers = { a: [] };',
    ];

    for (const line of unread) {
      expect(SourceText.of(FILE, line).objectAssignedTo('roles')).toBeUndefined();
    }
  });

  it('reads an entry at the depth of the object only, whatever brackets its neighbours nest', () => {
    const roles = rolesOf(
      'export const roles: Record<string, readonly string[]> = {',
      "  nested: { clerk: ['never this one'] },",
      '  typed: new Map<string, number>([[1, 2]]),',
      "  called: grants(['a', 'b'], { clerk: [] }),",
      "  clerk: ['b:*'],",
      '};',
    );

    expect(roles.entry('clerk')?.written).toBe("['b:*']");
    expect(roles.entry('nested')?.list()).toBeUndefined();
    expect(roles.entry('typed')?.list()).toBeUndefined();
    expect(roles.entry('called')?.list()).toBeUndefined();
    expect(roles.entry('missing')).toBeUndefined();
  });

  it('takes for a list a value that is one list and nothing more', () => {
    const roles = rolesOf(
      'const roles = {',
      "  spread: [...BASE, 'a'],",
      "  constant: ['a'] as const,",
      "  joined: ['a'].concat(OTHERS),",
      '  first: LISTS[0],',
      "  either: admin ? ['*'] : [],",
      '};',
    );

    expect(roles.entry('spread')?.list()?.has("'a'")).toBe(true);
    expect(roles.entry('constant')?.list()?.with("'b'")).toContain("  constant: ['a', 'b'] as const,");
    expect(roles.entry('joined')?.list()).toBeUndefined();
    expect(roles.entry('first')?.list()).toBeUndefined();
    expect(roles.entry('either')?.list()).toBeUndefined();
  });

  it('adds an item after items that nest brackets, hold a comma in a string, or end without a comma', () => {
    const nested = rolesOf('const roles = {', '  a: [', "    of(['x', 'y']),", "    'p, q' // both", '  ],', '};');

    expect(nested.entry('a')?.list()?.with('z')).toBe(
      ['const roles = {', '  a: [', "    of(['x', 'y']),", "    'p, q', // both", '    z,', '  ],', '};'].join('\n'),
    );

    const closedOnTheItem = rolesOf('const roles = {', "  a: ['x',", "    'y'],", '};');

    expect(closedOnTheItem.entry('a')?.list()?.with('z')).toBe(
      ['const roles = {', "  a: ['x',", "    'y', z],", '};'].join('\n'),
    );
  });

  it('holds an item written as asked, not one a comment or a longer item names', () => {
    const list = rolesOf('const roles = {', "  a: [set['x.y'] /* set['x'] */, other(set['z'])],", '};')
      .entry('a')
      ?.list();

    expect(list?.has("set['x.y']")).toBe(true);
    expect(list?.has("set['x']")).toBe(false);
    expect(list?.has("set['z']")).toBe(false);
  });

  it('refuses a new entry before an entry that shares its line, with what to do by hand', () => {
    const roles = rolesOf('const roles = {', '  a: [], system: [],', '};');

    const refusal = thrownBy(() => roles.withEntry('b: [],', { before: 'system', byHand: BY_HAND }));

    expect(refusal).toBeInstanceOf(CliError);

    expect(refusal).toMatchObject({
      message:
        'src/roles.ts: the object of `roles` does not open the entry of system on a line of its own, so the generator cannot tell where a new entry goes.',
      fix: BY_HAND,
    });
  });

  it('writes the first entry of an empty object one step in from its closing brace', () => {
    expect(rolesOf('  const roles = {', '  };').withEntry('a: [],', { byHand: BY_HAND })).toBe(
      ['  const roles = {', '    a: [],', '  };'].join('\n'),
    );
  });
});
