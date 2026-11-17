import { read, write } from '../helpers';
import { base, store, tablesFileOf } from './both-sides-add-a-table';
import { twoSides } from './two-sides';

/** How an ORM writes a column above `version` in the table of the orders, and what declares that table and the one of the invoices. */
interface ColumnStack {
  readonly orm: string;
  readonly above: RegExp;
  readonly column: (name: string) => string;
  /** The declaration that holds the table of the orders, and the region it is written in. */
  readonly table: string;
  readonly region: string;
  /** The table of the invoices, whole. */
  readonly added: RegExp;
}

export const ON_DRIZZLE: ColumnStack = {
  orm: 'drizzle',
  above: /(orders'[^]*?)(\n {2}version:)/,
  column: (name) => `  ${name}: text('${name}'),`,
  table: 'orders',
  region: 'tables',
  added: /^export const invoices = [^]*?^\}\);$/m,
};

const ON_KNEX: ColumnStack = {
  orm: 'knex',
  above: /(createOrderTable[^]*?)(\n {4}table\.integer\('version'\))/,
  column: (name) => `    table.text('${name}');`,
  table: 'createOrderTable',
  region: 'definitions',
  added: /^function createInvoiceTable[^]*?^\}$/m,
};

export const COLUMN_STACKS: readonly ColumnStack[] = [ON_DRIZZLE, ON_KNEX];

/** Writes a column above `version` in the table of the orders. */
export function withColumn(root: string, { orm, above, column }: ColumnStack, name: string): void {
  const file = tablesFileOf(root, orm);

  write(root, file, read(root, file).replace(above, `$1\n${column(name)}$2`));
}

/**
 * A project whose branch added the column `paidBy` to the table of the orders, then stored Invoice
 * below it, and whose trunk did `trunk` to the same file: git sets the column, the end of the
 * table and the start of the next one in one hunk.
 */
export function columnAndTable(stack: ColumnStack, trunk: (root: string) => void): string {
  return twoSides({
    orm: stack.orm,
    base: base(false),
    branch: (project) => {
      withColumn(project, stack, 'paidBy');
      store(project, 'Invoice');
    },
    trunk,
  });
}

/** The one hunk of a file, with the version of each side. */
export function hunkOf(text: string): { hunk: string; ours: string; theirs: string } {
  const [hunk = '', ours = '', theirs = ''] =
    /<{7} [^\n]*\n([^]*?)\|{7} [^\n]*\n[^]*?={7}\n([^]*?)>{7} [^\n]*\n/.exec(text) ?? [];

  return { hunk, ours, theirs };
}
