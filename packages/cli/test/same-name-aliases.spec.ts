import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config/parse-config';
import { readModule } from '../src/generate/kinds/same-name/read-module';
import { workspaceIndex } from '../src/generate/kinds/same-name/workspace-index';
import { Workspace } from '../src/workspace/workspace';
import { cli, read, write } from './helpers';
import { commitAll } from './support/commit-all';
import { expectOk } from './support/expect-ok';
import { CONTEXTS, INDEX } from './support/index-invariant';
import { initProject } from './support/init-project';
import {
  HAND_LINE,
  expectAsBefore,
  forcedOn,
  hedgedLoss,
  legacyTables,
  project,
  stored,
  unreadExtra,
  withLines,
} from './support/legacy-index';

const REAL = 'src/legacy/real.ts';
const IMPORTED = "import { archived } from './tables';\n\n";

/** Each shape of an alias of `archived` that `src/legacy/real.ts` exports as `kept`: none is the file's own. */
const ALIASES: readonly [string, string][] = [
  ['a constant an export list names', `${IMPORTED}const kept = archived;\n\nexport { kept };\n`],
  [
    'a member a constant an export list names',
    "import * as t from './tables';\n\nconst kept = t.archived;\n\nexport { kept };\n",
  ],
  ['a cast', `${IMPORTED}export const kept = archived as typeof archived;\n`],
  ['parentheses', `${IMPORTED}export const kept = (archived);\n`],
  ['a non-null assertion', `${IMPORTED}export const kept = archived!;\n`],
  [
    'a call and a default',
    `${IMPORTED}const none = (): undefined => undefined;\n\nexport const kept = none() ?? archived;\n`,
  ],
  [
    'a member of what a call returns',
    `${IMPORTED}const all = () => ({ archived });\n\nexport const kept = all().archived;\n`,
  ],
  [
    'an identity helper, its one argument wrapped with a comma after it',
    `${IMPORTED}function same<T>(value: T): T {\n  return value;\n}\n\nexport const kept = same(\n  archived,\n);\n`,
  ],
  [
    'an identity helper',
    `${IMPORTED}function same<T>(value: T): T {\n  return value;\n}\n\nexport const kept = same(archived);\n`,
  ],
];

describe('an alias of a table is no table of its own (XX1)', () => {
  it.each(ALIASES)('%s: init --force goes as before, said hedged', (_shape, code) => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, REAL, code);
    withLines(root, { region: "export * from '@/legacy/real';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', [REAL]));
  });

  it('an alias of a table the same file exports, kept for a deprecated name', () => {
    const root = project();

    write(
      root,
      'src/legacy/tables.ts',
      "import { pgTable, text } from 'drizzle-orm/pg-core';\n\nexport const archived = pgTable('legacy_archived', { id: text('id').primaryKey() });\n\n/** @deprecated */\nexport const kept = archived;\n",
    );

    withLines(root, { region: "export { kept } from '@/legacy/tables';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', ['src/legacy/tables.ts']));
  });
});

/** Values the kit takes for a table of the file's own, `archived` of the tables file behind them: the name `archived` is lost all the same. */
const OWN_TO_THE_KIT: readonly [string, string][] = [
  [
    'a member of an object the file builds',
    `${IMPORTED}const legacy = { archived };\n\nexport const kept = legacy.archived;\n`,
  ],
  ['a call on the table', `${IMPORTED}export const kept = archived.enableRLS();\n`],
  ['a copy into the table', `${IMPORTED}export const kept = Object.assign(archived, {});\n`],
];

describe('the names the index exports are compared, not the tables behind them (YY1)', () => {
  it.each(OWN_TO_THE_KIT)('%s: init --force says the name lost and leaves the index', (_shape, code) => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, REAL, code);
    withLines(root, { region: "export * from '@/legacy/real';", outside: HAND_LINE });

    const before = read(root, INDEX);
    const forced = forcedOn(root);

    expect(forced.code).toBe(3);
    expect(read(root, INDEX)).toBe(before);

    expect(forced.stdout).toContain(
      `${INDEX} is left as it stood before the command: the name \`archived\`, which 'src/legacy/tables.ts' gives the index, would be exported by no line after it (a table still exported under another name is not seen: the kit compares names).`,
    );
  });
});

describe('an alias outside the regions of the index (XX2)', () => {
  it('is a line the kit does not read, which init --force would drop: the index is left', () => {
    const root = project();

    legacyTables(root, 'archived');

    write(
      root,
      INDEX,
      `import { archived } from '@/legacy/tables';\n${read(root, INDEX)}const kept = archived;\n\nexport { kept };\n`,
    );

    const before = read(root, INDEX);
    const forced = forcedOn(root);

    expect(forced.code).toBe(3);
    expect(forced.stdout).toContain('outside the regions the kit writes it holds `export { kept };`');
    expect(read(root, INDEX)).toBe(before);
  });
});

/** The flag sets of the stacks whose index and tables files the kit must read with certainty. */
const STACKS: readonly string[][] = [
  [
    '--orm',
    'drizzle',
    '--event-sourcing',
    'on',
    '--audit',
    'on',
    '--queue',
    'database',
    '--tenancy',
    'shared-table',
    '--privacy',
    'on',
  ],
  ['--orm', 'drizzle', '--preset', 'identity', '--tenancy', 'shared-table', '--queue', 'redis', '--cache', 'redis'],
  ['--orm', 'drizzle', '--audit', 'off', '--privacy', 'off', '--queue', 'memory'],
  ['--orm', 'typeorm', '--event-sourcing', 'on', '--tenancy', 'shared-table', '--queue', 'database'],
];

/** The files of the project that hold tables: the schema index and every schema file of a context. */
function tableFiles(root: string): string[] {
  const contexts = path.join(root, 'src/contexts');

  return [
    INDEX,
    ...fs
      .readdirSync(contexts, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.schema.ts'))
      .map((file) => `src/contexts/${file}`),
  ];
}

describe('what the kit generates', () => {
  it.each(STACKS.map((flags) => [flags.join(' '), flags] as const))('is read with certainty: %s', (_stack, flags) => {
    const root = initProject(...CONTEXTS, '--package-manager', 'npm', ...flags);

    stored(root, 'billing', 'Order');
    expectOk(cli(root, 'generate', 'read-model', 'shipping', 'InvoiceSummaries', '--field', 'weight:number'));
    expectOk(cli(root, 'generate', 'process', 'billing', 'Dunning', '--term', 'Dunning=Asking again'));

    const files = tableFiles(root);

    expect(files.length).toBeGreaterThan(2);
    expect(files.flatMap((file) => readModule(read(root, file)).unread.map((why) => `${file}, ${why}`))).toEqual([]);

    if (flags.includes('drizzle')) {
      const config = parseConfig(JSON.parse(read(root, 'ddd-ts-kit.config.json')));

      expect(workspaceIndex(new Workspace(root, false), config).unread).toEqual([]);
    }
  });
});

describe('what the notes of a module not read say (XX3)', () => {
  it('quote a name exported as a string as it is written', () => {
    const read = readModule("import { archived as kept } from './tables';\n\nexport { kept as 'archived' };\n");

    expect(read.unread).toEqual(["line 3, `export { kept as 'archived' };`, a name exported as a string"]);
  });

  it('name every file read that shares a name, a file of no context too', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    legacyTables(root, 'orders');
    withLines(root, { region: "export * from '@/legacy/tables';", outside: '' });
    unreadExtra(root, 'legacy');

    commitAll(root);

    const said = stored(root, 'shipping', 'Order');
    const shared = said.split('\n').find((line) => line.includes('is shared by')) ?? '';

    expect(shared).toContain("'src/legacy/tables.ts'");
  });
});
