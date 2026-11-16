import { expect } from 'vitest';
import { cli, read, write } from '../helpers';
import { commitAll } from './commit-all';
import { expectOk } from './expect-ok';
import { CONTEXTS, INDEX } from './index-invariant';
import { initProject } from './init-project';

/** What the specs of the names of a Drizzle index put beside the tables of the contexts: a legacy folder, a module not read. */

export const tablesOf = (context: string): string =>
  `src/contexts/${context}/infrastructure/persistence/${context}.schema.ts`;
export const EXTRA = 'src/legacy/extra.ts';

export function stored(project: string, context: string, aggregate: string): string {
  const declared = expectOk(
    cli(project, 'generate', 'aggregate', context, aggregate, '--term', `${aggregate}=What ${context} keeps`),
  );

  return `${declared.stdout}\n${expectOk(cli(project, 'generate', 'repository', context, aggregate)).stdout}`;
}

/** A module the kit does not read (a pattern), holding only `constant`, re-exported whole in the region of the index. */
export function unreadExtra(project: string, constant: string): void {
  write(
    project,
    EXTRA,
    `import { pgTable, text } from 'drizzle-orm/pg-core';\n\nconst tables = { ${constant}: pgTable('${constant}_kept', { id: text('id').primaryKey() }) };\n\nexport const { ${constant} } = tables;\n`,
  );

  write(
    project,
    INDEX,
    read(project, INDEX).replace('// /ddd-ts-kit:schemas', "export * from '@/legacy/extra';\n// /ddd-ts-kit:schemas"),
  );
}

export function project(): string {
  return initProject('--orm', 'drizzle', ...CONTEXTS, '--package-manager', 'npm');
}

/** A tables file of no context, holding `constant`. */
export function legacyTables(project: string, constant: string): void {
  write(
    project,
    'src/legacy/tables.ts',
    `import { pgTable, text } from 'drizzle-orm/pg-core';\n\nexport const ${constant} = pgTable('legacy_${constant}', { id: text('id').primaryKey() });\n`,
  );
}

/** `init --force` on what the project holds, committed first. */
export function forcedOn(root: string): ReturnType<typeof cli> {
  commitAll(root);

  return cli(root, 'init', '--force');
}

/** What the guard says of a table no line the kit reads exports after the command, while `unread` is not read. */
export function hedgedLoss(name: string, unread: readonly string[]): string {
  const which = unread.length === 1 ? 'it exports' : 'one of them exports';

  return `${INDEX}: the name \`${name}\`, which 'src/legacy/tables.ts' gives the index, is exported by no line the kit can read after the command; it may still be exported through ${unread.map((file) => `'${file}'`).join(', ')} if ${which} it.`;
}

/** `init --force` that went as before: exit 0, the index written again without the line of the team. */
export function expectAsBefore(forced: ReturnType<typeof cli>, root: string, line: string): void {
  expect(forced.code).toBe(0);
  expect(forced.stdout).not.toContain('is left as it stood');
  expect(read(root, INDEX)).not.toContain(line);
}

/** The index of the project with `line` in the region of the schemas, which `init --force` keeps, and `outside` after it. */
export function withLines(root: string, { region, outside }: { region: string; outside: string }): void {
  write(
    root,
    INDEX,
    `${read(root, INDEX).replace('// /ddd-ts-kit:schemas', `${region}\n// /ddd-ts-kit:schemas`)}${outside}\n`,
  );
}

export const HAND_LINE = "export { archived } from '@/legacy/tables';";
