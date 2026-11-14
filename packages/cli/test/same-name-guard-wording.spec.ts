import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { INDEX } from './support/index-invariant';
import { expectAsBefore, forcedOn, legacyTables, project, stored, tablesOf } from './support/legacy-index';

const TABLES = 'src/legacy/tables.ts';

const TABLE =
  "import { pgTable, text } from 'drizzle-orm/pg-core';\n\nexport const archived = pgTable('legacy_archived', { id: text('id').primaryKey() });\n";

const NAMES_ONLY = '(a table still exported under another name is not seen: the kit compares names)';

const GONE = `${INDEX}: the name \`archived\`, which '${TABLES}' gave the index, is exported by no line after the command ('${TABLES}', which the kit does not read with certainty, is no more named by the index).`;

/** `init --force` on the project, `line` written after the regions of its index. */
function forcedWith(root: string, line: string): ReturnType<typeof cli> {
  write(root, INDEX, `${read(root, INDEX)}${line}\n`);

  return forcedOn(root);
}

describe('a name lost with the file not read that gave it (ZZ1)', () => {
  it('is said lost plainly when the index names that file no more: a file re-exported whole', () => {
    const root = project();
    const star = "export * from '../../legacy/tables';";

    write(root, TABLES, `${TABLE}export const again = archived;\n`);

    const forced = forcedWith(root, star);

    expectAsBefore(forced, root, star);
    expect(forced.stdout).toContain(GONE);
    expect(forced.stdout).not.toContain('may still be exported');
  });

  it('is said lost plainly when the index names that file no more: a name taken from a file with a default export', () => {
    const root = project();
    const line = "export { archived } from '@/legacy/tables';";

    write(root, TABLES, `${TABLE}\nexport default archived;\n`);

    const forced = forcedWith(root, line);

    expectAsBefore(forced, root, line);
    expect(forced.stdout).toContain(GONE);
    expect(forced.stdout).not.toContain('may still be exported');
  });
});

describe('the file a name lost is said to come from (ZZ2)', () => {
  it('is the one the line of the index names, not the one that declares the table', () => {
    const root = project();

    stored(root, 'billing', 'Order');

    write(
      root,
      TABLES,
      `export { orders as archived } from '@/contexts/billing/infrastructure/persistence/billing.schema';\n`,
    );

    const forced = forcedWith(root, "export * from '@/legacy/tables';");

    expect(forced.code).toBe(3);

    expect(forced.stdout).toContain(
      `${INDEX} is left as it stood before the command: the name \`archived\`, which '${TABLES}' gives the index, would be exported by no line after it ${NAMES_ONLY}.`,
    );

    expect(forced.stdout).not.toContain(`which '${tablesOf('billing')}' gives the index`);
  });
});

describe('the advice of a name lost (ZZ3)', () => {
  it('speaks of the names, by their count, and of a package as it is named', () => {
    const root = project();

    legacyTables(root, 'archived');

    const forced = forcedWith(root, "export * from '@/legacy/tables';\nexport { sql } from 'drizzle-orm';");

    expect(forced.code).toBe(3);

    expect(forced.stdout).toContain(
      "the name `sql`, which 'drizzle-orm' gives the index, would be exported by no line after it",
    );

    expect(forced.stdout).toContain('move what keeps these names inside the `// ddd-ts-kit:schemas` region');
    expect(forced.stdout).not.toContain('this table');
  });
});

describe('a line of the index the kit does not read (ZZ4)', () => {
  it('is quoted as the index writes it', () => {
    const root = project();
    const line = "export * as legacy from '../../legacy/tables';";

    legacyTables(root, 'archived');

    const forced = forcedWith(root, line);

    expect(forced.stdout).toContain(`\`${line}\``);
    expect(forced.stdout).not.toMatch(/from ' +'/);
  });
});

const table = (name: string): string =>
  `import { pgTable, text } from 'drizzle-orm/pg-core';\n\nexport const ${name} = pgTable('legacy_${name}', { id: text('id').primaryKey() });\n`;

describe('a name moved with the file not read gone from the index (AA1)', () => {
  it('is said plainly, as the name lost with it', () => {
    const root = project();
    const gone = "('src/legacy/u2.ts', which the kit does not read with certainty, is no more named by the index)";

    stored(root, 'billing', 'Invoice');
    write(root, 'src/legacy/u2.ts', `${table('two')}export const again_u2 = two;\n`);
    write(root, 'src/legacy/a.ts', table('invoices'));

    const forced = forcedWith(root, "export * from '@/legacy/u2';\nexport { invoices } from '@/legacy/a';");

    expect(forced.code).toBe(0);
    expect(forced.stdout).not.toContain('is left as it stood');

    expect(forced.stdout).toContain(
      `${INDEX}: the name \`two\`, which 'src/legacy/u2.ts' gave the index, is exported by no line after the command ${gone}.`,
    );

    expect(forced.stdout).toContain(
      `${INDEX}: \`invoices\`, which named the \`invoices\` of 'src/legacy/a.ts' by the lines the kit read, names the \`invoices\` of '${tablesOf('billing')}' after the command ${gone}.`,
    );
  });
});

describe('one line that keeps two names (AA4)', () => {
  it('is no lines: the advice says what keeps these names', () => {
    const root = project();

    write(root, 'src/legacy/a.ts', `${table('archived')}${table('closed').split('\n').slice(2).join('\n')}`);

    const forced = forcedWith(root, "export { archived, closed } from '@/legacy/a';");

    expect(forced.code).toBe(3);

    expect(forced.stdout).toContain(
      'move what keeps these names inside the `// ddd-ts-kit:schemas` region, which the rewrite keeps,',
    );

    expect(forced.stdout).not.toContain('the lines that keep');
  });
});

describe('two exports the kit does not read on one line of the index (AA5)', () => {
  it('quote the line once', () => {
    const root = project();
    const line = "export { archived as 'a-old' }; export { closed as 'c-old' };";

    write(root, INDEX, `import { archived, closed } from '@/legacy/a';\n${read(root, INDEX)}`);
    write(root, 'src/legacy/a.ts', `${table('archived')}${table('closed').split('\n').slice(2).join('\n')}`);

    const forced = forcedWith(root, line);

    expect(forced.code).toBe(3);

    expect(forced.stdout).toContain(
      `outside the regions the kit writes it holds \`${line}\`, which the kit does not read with certainty`,
    );
  });
});

describe('what a name lost may still come through (AA6)', () => {
  it('is no file when it is a package: if it exports it', () => {
    const root = project();
    const line = "export { archived } from '@/legacy/tables';";

    legacyTables(root, 'archived');

    write(
      root,
      INDEX,
      read(root, INDEX).replace(
        '// /ddd-ts-kit:schemas',
        "export * from '@acme/legacy-tables';\n// /ddd-ts-kit:schemas",
      ),
    );

    const forced = forcedWith(root, line);

    expectAsBefore(forced, root, line);

    expect(forced.stdout).toContain(
      `${INDEX}: the name \`archived\`, which '${TABLES}' gives the index, is exported by no line the kit can read after the command; it may still be exported through '@acme/legacy-tables' if it exports it.`,
    );
  });
});
