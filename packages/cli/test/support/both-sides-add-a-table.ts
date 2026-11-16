import { expect } from 'vitest';
import { cli, read, walk, write } from '../helpers';
import { commitAll } from './commit-all';
import { expectOk } from './expect-ok';
import { twoSides } from './two-sides';

/** The file of a context that holds its tables, by ORM: the one both sides of the merge add a table to. */
const TABLES_FILE: Readonly<Record<string, RegExp>> = {
  drizzle: /\/billing\.schema\.ts$/,
  typeorm: /\/billing\.schema\.ts$/,
  knex: /\/create-billing-tables\.schema\.ts$/,
  prisma: /^prisma\/schema\/billing\.prisma$/,
};

/** How each ORM writes the tables of the three aggregates in that file. */
export const TABLES: Readonly<Record<string, readonly string[]>> = {
  drizzle: ['export const orders =', 'export const invoices =', 'export const refunds ='],
  typeorm: ['export const orders =', 'export const invoices =', 'export const refunds ='],
  knex: ['function createOrderTable(', 'function createInvoiceTable(', 'function createRefundTable('],
  prisma: ['model BillingOrder {', 'model BillingInvoice {', 'model BillingRefund {'],
};

const TERMS = ['Order', 'Invoice', 'Refund'].flatMap((term) => ['--term', `${term}=What billing keeps of it`]);

/** An aggregate of billing with its repository, in a module of the context when it is laid out in modules. */
export function store(root: string, aggregate: string, more: readonly string[] = []): void {
  expectOk(cli(root, 'generate', 'aggregate', 'billing', aggregate, ...more));
  expectOk(cli(root, 'generate', 'repository', 'billing', aggregate, ...more.filter((flag) => !TERMS.includes(flag))));
}

/** The base both sides start from: billing stores Order, flat or laid out in modules, its glossary holding the three terms. */
export function base(modules: boolean): (root: string) => void {
  return (root) => {
    withoutPrismaClient(root);

    if (!modules) {
      store(root, 'Order', TERMS);

      return;
    }

    commitAll(root);

    expectOk(
      cli(
        root,
        'generate',
        'module',
        'billing',
        'invoicing',
        '--purpose',
        'Bills the orders.',
        '--term',
        'Invoicing=billing',
      ),
    );

    expectOk(cli(root, 'context-layout', 'billing'));
    commitAll(root);
    store(root, 'Order', ['--module', 'invoicing', ...TERMS]);
  };
}

/** The `db:client` script each project had, by its root. */
const CLIENT_SCRIPTS = new Map<string, string>();

/** The merge generates the client of Prisma again once the schema changed: nothing is installed here, the script does nothing. */
function withoutPrismaClient(root: string): void {
  const manifest: { scripts: Record<string, string> } = JSON.parse(read(root, 'package.json'));
  const script = manifest.scripts['db:client'];

  if (script !== undefined) {
    CLIENT_SCRIPTS.set(root, script);
    manifest.scripts['db:client'] = 'node -e ""';
    write(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

/** Gives a project on Prisma the `db:client` script it was generated with, for a run that has the dependencies. */
export function withPrismaClient(root: string): void {
  const manifest: { scripts: Record<string, string> } = JSON.parse(read(root, 'package.json'));

  manifest.scripts['db:client'] = CLIENT_SCRIPTS.get(root) ?? '';
  write(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

/** A project whose branch stored Invoice in billing and whose trunk stored Refund there, since a base that stores Order. */
export function bothSidesAddATable(orm: string, modules: boolean): string {
  const more = modules ? ['--module', 'invoicing'] : [];

  return twoSides({
    orm,
    base: base(modules),
    branch: (root) => store(root, 'Invoice', more),
    trunk: (root) => store(root, 'Refund', more),
  });
}

/** The tables file of billing in a project, from its root. */
export function tablesFileOf(root: string, orm: string): string {
  const [file = '', ...others] = walk(root).filter((candidate) => TABLES_FILE[orm]?.test(candidate) === true);

  expect(others, file).toEqual([]);

  return file;
}
