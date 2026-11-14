import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { read, write } from './helpers';
import { commitAll } from './support/commit-all';
import { INDEX } from './support/index-invariant';
import {
  EXTRA,
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

describe('a table lost or a name moved while something is not read with certainty (WW1)', () => {
  it('B1: a line of the team re-exporting a file read with certainty goes as before, said hedged', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, INDEX, `${read(root, INDEX)}export * from '@/legacy/tables';\n`);
    unreadExtra(root, 'legacy');

    const forced = forcedOn(root);

    expectAsBefore(forced, root, "export * from '@/legacy/tables';");
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('B2: a name a linked module may still export is said hedged, and the line goes as before', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, 'src/legacy/real.ts', "export * from './tables';\n");
    fs.symlinkSync('real.ts', path.join(root, EXTRA));
    withLines(root, { region: "export * from '@/legacy/extra';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(read(root, INDEX)).toContain("export * from '@/legacy/extra';");
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('B3, F3b: a name moved to a context while a module is not read is said hedged, never what it would export', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    legacyTables(root, 'orders');
    write(root, INDEX, `${read(root, INDEX)}export { orders } from '@/legacy/tables';\n`);
    unreadExtra(root, 'orders');

    const forced = forcedOn(root);

    expectAsBefore(forced, root, "export { orders } from '@/legacy/tables';");
    expect(forced.stdout).not.toContain('would export');

    expect(forced.stdout).toContain(
      `${INDEX}: \`orders\`, which named the \`orders\` of 'src/legacy/tables.ts', may name another table after the command (the kit does not read '${EXTRA}').`,
    );
  });

  it('F3b: a module not read under a string name the word test cannot see: no clause of what the name would export', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    legacyTables(root, 'orders');
    write(root, EXTRA, "import { orders as kept } from './tables';\n\nexport { kept as 'orders' };\n");

    withLines(root, {
      region: "export * from '@/legacy/extra';",
      outside: "export { orders } from '@/legacy/tables';",
    });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, "export { orders } from '@/legacy/tables';");
    expect(forced.stdout).not.toContain('would export');

    expect(forced.stdout).toContain(
      "`orders`, which named the `orders` of 'src/legacy/tables.ts', may name another table after the command",
    );
  });

  it('F1a: a member alias in a module not read, which the word test misses', () => {
    const root = project();

    legacyTables(root, 'archived');

    write(
      root,
      EXTRA,
      "import * as t from './tables';\n\nexport const { other } = t;\nexport const kept = t.archived;\n",
    );

    withLines(root, { region: "export * from '@/legacy/extra';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('F2: a name exported as a string', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, EXTRA, "import { archived as kept } from './tables';\n\nexport { kept as 'archived' };\n");
    withLines(root, { region: "export * from '@/legacy/extra';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('F3a: a link to a file that re-exports a package of the workspace', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, 'src/legacy/real.ts', "export * from '@acme/legacy-tables';\n");
    fs.symlinkSync('real.ts', path.join(root, EXTRA));
    withLines(root, { region: "export * from '@/legacy/extra';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('a name moved while an export of the index itself is not read', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    legacyTables(root, 'orders');

    withLines(root, {
      region: 'export const { orders: legacyOrders } = { orders: 1 };',
      outside: "export { orders } from '@/legacy/tables';",
    });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, "export { orders } from '@/legacy/tables';");

    expect(forced.stdout).toContain(
      `${INDEX}: \`orders\`, which named the \`orders\` of 'src/legacy/tables.ts', may name another table after the command (the kit does not read '${INDEX}').`,
    );
  });
});

describe('an alias of a binding the file does not build (WW2)', () => {
  it('F1b: makes the file not read with certainty, and init --force goes as before, said hedged', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, 'src/legacy/real.ts', "import { archived } from './tables';\n\nexport const kept = archived;\n");
    withLines(root, { region: "export * from '@/legacy/real';", outside: HAND_LINE });

    const forced = forcedOn(root);

    expectAsBefore(forced, root, HAND_LINE);
    expect(forced.stdout).toContain(hedgedLoss('archived', ['src/legacy/real.ts']));
  });

  it('keeps a member of a constant the file builds its own, as the event store of the template: a loss elsewhere is refused', () => {
    const root = project();

    legacyTables(root, 'archived');

    write(
      root,
      'src/legacy/real.ts',
      "import { pgTable, text } from 'drizzle-orm/pg-core';\n\nconst built = { kept: pgTable('legacy_kept', { id: text('id').primaryKey() }) };\nconst again = built;\n\nexport const kept = again.kept;\n",
    );

    withLines(root, { region: "export * from '@/legacy/real';", outside: "export * from '@/legacy/tables';" });

    const forced = forcedOn(root);

    expect(forced.code).toBe(3);

    expect(forced.stdout).toContain(
      `${INDEX} is left as it stood before the command: the name \`archived\`, which 'src/legacy/tables.ts' gives the index, would be exported by no line after it (a table still exported under another name is not seen: the kit compares names).`,
    );
  });
});

describe('a link out of the project, re-exported whole (VV4)', () => {
  it('is not looked into: it may export every name shared', () => {
    const root = project();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-ts-kit-outside-'));

    fs.writeFileSync(path.join(outside, 'tables.ts'), 'export const kept = 1;\n');
    fs.mkdirSync(path.join(root, 'src/legacy'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'tables.ts'), path.join(root, EXTRA));

    write(
      root,
      INDEX,
      read(root, INDEX).replace('// /ddd-ts-kit:schemas', "export * from '@/legacy/extra';\n// /ddd-ts-kit:schemas"),
    );

    stored(root, 'billing', 'Order');
    commitAll(root);

    const said = stored(root, 'shipping', 'Order');

    expect(said).toContain(`'${EXTRA}', a symbolic link, which the kit does not follow, which may export \`orders\``);
    expect(said).not.toContain('`orders` is shared by');
  });
});
