import { describe, expect, it } from 'vitest';
import { CliError } from '../src/cli-error';
import { addFactory } from '../src/generate/errors/add-factory';
import { withImport } from '../src/generate/with-import';
import { insertInRegion, replaceInRegion } from '../src/markers';
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

describe('an import added to a source', () => {
  const ADDED = "import { billingPermissions } from '@/b';";

  it('follows the last import of a file written without semicolons, never a line of a function', () => {
    const source = [
      "import type { Grant } from '@ddd-ts-kit/auth'",
      "import { Role } from './role'",
      '',
      'export function holders(role: string) {',
      '  const found = roles[role];',
      '  return found',
      '}',
      '',
    ];

    expect(withImport(source.join('\n'), ADDED)).toBe([...source.slice(0, 2), ADDED, ...source.slice(2)].join('\n'));
  });

  it('follows an import written on several lines, with double quotes, a comment after it or import attributes', () => {
    const several = ['import {', '  A, // the a', '  B,', '} from "@/x" // both', 'const a = 1;', ''];
    const attributes = ["import data from './data.json' with { type: 'json' };", 'run(data);', ''];

    expect(withImport(several.join('\n'), ADDED)).toBe([...several.slice(0, 4), ADDED, ...several.slice(4)].join('\n'));

    expect(withImport(attributes.join('\n'), ADDED)).toBe([attributes[0], ADDED, ...attributes.slice(1)].join('\n'));
  });

  it('takes no import of a comment, a string, a template, a dynamic import or a type for the last one', () => {
    const source = [
      "import { A } from '@/a';",
      '',
      "// import { B } from '@/b';",
      "const text = `import { C } from '@/c';`;",
      "const lazy = () => import('@/d');",
      "type E = import('@/e').E;",
      "const from = { import: 'f' };",
      '',
    ];

    expect(withImport(source.join('\n'), ADDED)).toBe([source[0], ADDED, ...source.slice(1)].join('\n'));
  });

  it('leaves a file that binds the name already, however the statement is written', () => {
    const bound = [
      'import { billingPermissions } from "@/b"',
      "import {\n  other,\n  billingPermissions, // the set\n} from '@/b';",
      "import { permissions as billingPermissions } from '@/elsewhere';",
      "import billingPermissions from '@/b';",
      "import * as billingPermissions from '@/b';",
    ];

    for (const source of bound) {
      expect(withImport(`${source}\n`, ADDED)).toBe(`${source}\n`);
    }

    expect(withImport("import { billingPermissions as other } from '@/b';\n", ADDED)).toContain(`\n${ADDED}\n`);

    expect(withImport("import 'reflect-metadata';\n", "import 'reflect-metadata';")).toBe(
      "import 'reflect-metadata';\n",
    );
  });

  it('opens a file without imports, after the line that says what runs it', () => {
    expect(withImport('run();\n', ADDED)).toBe(`${ADDED}\nrun();\n`);
    expect(withImport('#!/usr/bin/env node\nrun();\n', ADDED)).toBe(`#!/usr/bin/env node\n${ADDED}\nrun();\n`);
  });

  it('splits the line of an import that shares it with a statement, where the end of the line is not the end of a statement', () => {
    expect(withImport("import { A } from '@/a'; const all = [\n  A,\n];\n", ADDED)).toBe(
      `import { A } from '@/a';\n${ADDED} const all = [\n  A,\n];\n`,
    );
  });
});

describe('a factory added to a class', () => {
  const factory = { className: 'InvoiceRefusal', name: 'forPaid', text: '  static forPaid() {}' };

  it('opens the body of the class, never an object type or an argument of what it extends', () => {
    const heads = [
      'export class InvoiceRefusal extends Refusal<{ invoiceId: string }> {',
      'export class InvoiceRefusal<Facts extends { id: string } = { id: string }> extends Refusal<Facts> {',
      "export class InvoiceRefusal extends refusalOf({ code: 'PAID' }) implements Told<{ at: Date }> {",
      'export class InvoiceRefusal\n  extends Refusal<() => { id: string }>\n{',
    ];

    for (const head of heads) {
      expect(addFactory(`${head}\n  readonly kept = true;\n}\n`, factory)).toBe(
        `${head}\n  static forPaid() {}\n\n  readonly kept = true;\n}\n`,
      );
    }
  });

  it('follows the block of the last factory, never the object type it returns', () => {
    const source = [
      'export class InvoiceRefusal extends Refusal {',
      '  static forDraft(): { refusal: InvoiceRefusal } | undefined {',
      '    return undefined;',
      '  }',
      '',
      '  readonly kept = true;',
      '}',
      '',
    ];

    expect(addFactory(source.join('\n'), factory)).toBe(
      [...source.slice(0, 4), '', '  static forPaid() {}', ...source.slice(4)].join('\n'),
    );
  });

  it('finds no class in a comment or a string that names it', () => {
    expect(
      addFactory("// class InvoiceRefusal {}\nconst text = 'class InvoiceRefusal {}';\n", factory),
    ).toBeUndefined();
  });
});

describe('an import merged into the imports region', () => {
  const region = (...lines: readonly string[]): string =>
    ['// ddd-ts-kit:imports', ...lines, '// /ddd-ts-kit:imports', 'run();', ''].join('\n');

  it('keeps a statement that holds a comment as it is written, and imports the new name beside it', () => {
    const held = ['import {', '  C, // the c', '  D,', "} from '@/z';"];

    expect(insertInRegion(region(...held), 'imports', "import { G } from '@/z';")).toBe(
      region(...held, "import { G } from '@/z';"),
    );

    expect(insertInRegion(region(...held), 'imports', "import { D } from '@/z';")).toBe(region(...held));
  });

  it('adds a name to the statement of its module whatever its quotes and its semicolon, in the style of that statement', () => {
    expect(insertInRegion(region('import { A } from "@/x"'), 'imports', "import { A } from '@/x';")).toBe(
      region('import { A } from "@/x"'),
    );

    expect(insertInRegion(region('import { A } from "@/x"'), 'imports', "import { B } from '@/x';")).toBe(
      region('import { A, B } from "@/x"'),
    );

    expect(insertInRegion(region("import {A,B} from '@/x';"), 'imports', "import { B, C } from '@/x';")).toBe(
      region("import { A, B, C } from '@/x';"),
    );
  });

  it('never merges a type import with a value import, a default import or a namespace', () => {
    const held = ["import type { A } from '@/x';", "import x, { B } from '@/x';", "import * as all from '@/y';"];

    expect(insertInRegion(region(...held), 'imports', "import { C } from '@/x';\nimport { D } from '@/y';")).toBe(
      region(...held, "import { C } from '@/x';", "import { D } from '@/y';"),
    );

    expect(insertInRegion(region(...held), 'imports', "import type { C } from '@/x';")).toBe(
      region("import type { A, C } from '@/x';", ...held.slice(1)),
    );
  });

  it('keeps the comments and the statements it does not read between the imports', () => {
    const held = ['// the wiring of billing', "import { A } from '@/x';", '', "import '@/polyfill'; // first"];

    expect(insertInRegion(region(...held), 'imports', "import { B } from '@/x';\nimport '@/polyfill';")).toBe(
      region(held[0] ?? '', "import { A, B } from '@/x';", ...held.slice(2)),
    );
  });
});

describe('a block replaced in a region', () => {
  it("writes the new block as it is given, a `$&` or a `$'` of it included", () => {
    const file = ['// ddd-ts-kit:registrations', 'old();', '// /ddd-ts-kit:registrations', ''].join('\n');
    const by = "price(/^\\d+$/, '$&', \"$'\");";

    expect(replaceInRegion(file, 'registrations', { replaced: 'old();', by })).toBe(file.replace('old();', () => by));
  });
});
