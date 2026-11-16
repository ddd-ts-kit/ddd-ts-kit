import { mergedRegion } from '../../src/merge/declarations/merged-region';
import type { MergeRepository } from '../../src/merge/lost/merge-repository';
import { resolveConflict } from '../../src/merge/resolve-conflict';
import type { Resolution } from '../../src/merge/resolution';
import { mergeRepository } from './merge-repository';
import { type ThreeSides, threeWay } from './three-way-path';

export const REPO: MergeRepository = { top: '/repository', prefix: '', contextsDir: 'src/contexts', modules: {} };
export const TABLES_FILE = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';
/** What the report says of a file whose regions of declarations were merged. */
export const KEPT = 'generated registry: the declarations of both sides kept, each one whole';
/** What it says when another region of the file was merged as the lines of both sides. */
export const KEPT_WITH_LINES = `${KEPT}, and the lines of both sides kept`;

/** A table of Drizzle as `generate repository` writes it, with more columns. */
export function table(name: string, ...columns: readonly string[]): string[] {
  return [
    `export const ${name} = billingSchema.table('${name}', {`,
    "  id: text('id').primaryKey(),",
    `  // TODO(domain): add one column per field (and its constraints); then run \`npm run db:generate <what-it-does>\`.`,
    ...columns,
    "  version: integer('version').notNull(),",
    '  ...auditColumns(),',
    '});',
  ];
}

/** The tables file of a context on Drizzle: its imports, its schema, its tables set apart by a blank line. */
export function tablesFile(tables: readonly (readonly string[])[], imports: readonly string[] = []): string {
  return [
    '// ddd-ts-kit:imports',
    "import { integer, text } from 'drizzle-orm/pg-core';",
    ...imports,
    '// /ddd-ts-kit:imports',
    '',
    "export const billingSchema = contextSchema('billing');",
    '',
    '// ddd-ts-kit:tables',
    ...tables.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines])),
    '// /ddd-ts-kit:tables',
    '',
  ].join('\n');
}

/** What merge-trunk makes of a file whose three sides are these, merged as the kit merges them. */
export function merged(sides: ThreeSides, file = TABLES_FILE): Resolution {
  const { path, top } = threeWay(file, sides);

  return resolveConflict(path, { ...REPO, top });
}

export const ORDERS = table('orders');
export const INVOICES = table('invoices');
export const REFUNDS = table('refunds');

const LABELS = { ours: '<<<<<<< HEAD', base: '||||||| base', theirs: '>>>>>>> main' };

/**
 * The `tables` region of a file merged declaration by declaration from its three sides, whatever
 * hunks git would leave in it: its lines, or undefined when the region is left as git wrote it.
 */
export function mergedTables(sides: ThreeSides): readonly string[] | undefined {
  const top = mergeRepository({ base: {}, ours: {}, theirs: {} });

  return mergedRegion('tables', { file: TABLES_FILE, binary: false, ...sides }, { top, labels: LABELS, blocks: 1 })
    .lines;
}

/** The lines of the `tables` region of a tables file. */
export function tablesOf(tables: readonly (readonly string[])[]): string[] {
  return tables.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines]));
}
