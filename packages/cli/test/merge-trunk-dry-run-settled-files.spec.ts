import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { expectOk } from './support/expect-ok';
import { INDEX } from './support/index-invariant';
import { git } from './support/git';
import { goOn, mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const TABLES = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';

/** One entry the report lists under `automatic`. */
interface Automatic {
  readonly file: string;
  readonly kind: string;
  readonly how: string;
}

function readModel(project: string, context: string, name: string, ...more: string[]): void {
  expectOk(cli(project, 'generate', 'read-model', context, name, ...more));
}

/** The table `orders` of billing given another constant: the line both sides change, which the merge settles. */
function renamed(constant: string): (project: string) => void {
  return (project) =>
    write(
      project,
      TABLES,
      read(project, TABLES).replace(
        "export const orders = billingSchema.table('orders'",
        `export const ${constant} = billingSchema.table('orders'`,
      ),
    );
}

/** The table `orders` of billing taken out, as each side does before adding a table of its own. */
function withoutOrders(project: string): void {
  write(project, TABLES, read(project, TABLES).replace(/^export const orders = [\s\S]*?\n\}\);\n/m, ''));
}

/** What the dry run, then the real run, list under `automatic` for the schema index. */
function indexSentences(root: string): { previewed: readonly Automatic[]; merged: readonly Automatic[] } {
  const ofIndex = (stdout: string): readonly Automatic[] => {
    const report: { automatic: readonly Automatic[] } = JSON.parse(stdout);

    return report.automatic.filter(({ file }) => file === INDEX);
  };

  const previewed = ofIndex(mergeTrunk(root, '--dry-run', '--json').stdout);

  return { previewed, merged: ofIndex(mergeTrunk(root, '--json').stdout) };
}

describe('merge-trunk --dry-run, a tables file the merge settles itself', () => {
  const base = (project: string): void => {
    readModel(project, 'billing', 'Invoices');
    readModel(project, 'billing', 'Orders');
  };

  it('both sides renaming the constant of one table: no name only the base held is taken for a table', () => {
    const root = twoSides({
      orm: 'drizzle',
      base,
      trunk: (project) => {
        renamed('purchases')(project);
        readModel(project, 'shipping', 'Orders', '--field', 'weight:number');
      },
      branch: renamed('sales'),
    });

    const { previewed, merged } = indexSentences(root);

    expect(previewed.map(({ how }) => how).join('\n')).not.toContain('lists the name `orders` of billing');
    expect(previewed).toEqual(merged);
  });

  it('both sides taking one table out and adding one of their own: the dry run says what the merge says', () => {
    const root = twoSides({
      orm: 'drizzle',
      base,
      trunk: (project) => {
        withoutOrders(project);
        readModel(project, 'billing', 'Refunds');
        readModel(project, 'shipping', 'Orders', '--field', 'weight:number');
      },
      branch: (project) => {
        withoutOrders(project);
        readModel(project, 'billing', 'Credits');
      },
    });

    const { previewed, merged } = indexSentences(root);

    expect(previewed.map(({ how }) => how).join('\n')).not.toContain('`orders` of billing');
    expect(previewed).toEqual(merged);
  });
});

/** The table `invoices` of billing replaced in place by another, the schema line of billing marked: each side its own. */
function replacedInvoices(table: string, mark: string): (project: string) => void {
  return (project) => {
    const replaced = read(project, TABLES)
      .replace(
        /^export const invoices = [\s\S]*?\n\}\);\n/m,
        `export const ${table} = billingSchema.table('${table}', { id: text('id').primaryKey() });\n`,
      )
      .replace(
        "export const billingSchema = contextSchema('billing');",
        `export const billingSchema = contextSchema('billing'); // ${mark}`,
      );

    write(project, TABLES, replaced);
  };
}

describe('merge-trunk --dry-run, a tables file left to a person whose registry the merge settles', () => {
  it('reads the text the person is handed: no table the two sides took out comes back', () => {
    const root = twoSides({
      orm: 'drizzle',
      base: (project) => {
        readModel(project, 'billing', 'Invoices');
        readModel(project, 'billing', 'Orders');
      },
      trunk: (project) => {
        replacedInvoices('refunds', 'trunk')(project);
        readModel(project, 'shipping', 'Invoices', '--field', 'weight:number');
      },
      branch: replacedInvoices('credits', 'branch'),
    });

    const ofIndex = (stdout: string): readonly Automatic[] => {
      const report: { automatic: readonly Automatic[] } = JSON.parse(stdout);

      return report.automatic.filter(({ file }) => file === INDEX);
    };

    const previewed = ofIndex(mergeTrunk(root, '--dry-run', '--json').stdout);

    mergeTrunk(root);

    write(
      root,
      TABLES,
      read(root, TABLES).replace(/^<{7}[^\n]*\n([\s\S]*?)(?:^\|{7}[\s\S]*?)?^={7}\n[\s\S]*?^>{7}[^\n]*\n/m, '$1'),
    );

    git(root, 'add', '--all');

    const continued = ofIndex(goOn(root, '--continue', '--json').stdout);

    expect(previewed.map(({ how }) => how).join('\n')).not.toContain('`invoices` of billing');
    expect(previewed).toEqual(continued);
  });
});
