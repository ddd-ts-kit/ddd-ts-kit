import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, read, tempDir, write } from './helpers';
import { asMainLeavesIt } from './support/as-main-leaves-it';
import { expectOk } from './support/expect-ok';
import { forcedInit } from './support/forced-init';
import { CONTEXTS, INDEX } from './support/index-invariant';
import { initProject } from './support/init-project';
import { git } from './support/git';
import { goOn, mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';
import { resolveKeepingBoth } from './support/two-tables-files';

const LINKED = (file: string): string => `'${file}', a symbolic link, which the kit does not follow`;
const BILLING = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';
const SHIPPING = 'src/contexts/shipping/infrastructure/persistence/shipping.schema.ts';

/** One entry the report lists under `automatic`. */
interface Automatic {
  readonly file: string;
  readonly kind: string;
  readonly how: string;
}

/** What the dry run, then the real run, list under `automatic` for the schema index, and the index as main would leave it. */
function bothRuns(root: string): { previewed: readonly Automatic[]; merged: readonly Automatic[]; main: string } {
  const ofIndex = (stdout: string): readonly Automatic[] => {
    const report: { automatic: readonly Automatic[] } = JSON.parse(stdout);

    return report.automatic.filter(({ file }) => file === INDEX);
  };

  const main = asMainLeavesIt(root);
  const previewed = ofIndex(mergeTrunk(root, '--dry-run', '--json').stdout);

  return { previewed, merged: ofIndex(mergeTrunk(root, '--json').stdout), main };
}

function said(entries: readonly Automatic[]): string {
  return entries.map(({ how }) => how).join('\n');
}

function stored(project: string, context: string, aggregate: string): void {
  expectOk(cli(project, 'generate', 'aggregate', context, aggregate, '--term', `${aggregate}=What ${context} keeps`));
  expectOk(cli(project, 'generate', 'repository', context, aggregate));
}

/** billing stores Order, its tables file moved beside it and replaced by a link to `target(moved)`. */
function linkedOrders(target: (moved: string) => string): (project: string) => void {
  return (project) => {
    stored(project, 'billing', 'Order');

    const moved = path.join(project, path.dirname(BILLING), 'billing-tables.ts');

    fs.renameSync(path.join(project, BILLING), moved);
    fs.symlinkSync(target(moved), path.join(project, BILLING));
  };
}

describe('merge-trunk, a tables file that is a symbolic link on one side', () => {
  it.each([
    ['relative, within the tree', () => (_moved: string) => 'billing-tables.ts'],
    ['absolute, inside the repository', () => (moved: string) => moved],
  ])('%s: a name shared, both runs say the link and write no name', (_how, target) => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: linkedOrders(target()),
      branch: (project) => stored(project, 'shipping', 'Order'),
    });

    const { previewed, merged, main } = bothRuns(root);

    expect(said(merged)).toContain(LINKED(BILLING));
    expect(said(merged)).not.toContain('lists the name');
    expect(previewed).toEqual(merged);
    expect(read(root, INDEX)).toBe(main);
  });

  it('absolute, outside the repository: neither run looks into it, nor says what it cannot see, and none writes a name', () => {
    const outside = fs.realpathSync(tempDir('outside-tables'));

    const root = twoSides({
      orm: 'drizzle',
      trunk: linkedOrders((moved) => {
        const kept = path.join(outside, 'billing-tables.ts');

        fs.copyFileSync(moved, kept);

        return kept;
      }),
      branch: (project) => stored(project, 'shipping', 'Order'),
    });

    const { previewed, merged, main } = bothRuns(root);

    expect(said(merged)).not.toContain('lists the name');
    expect(previewed).toEqual(merged);
    expect(read(root, INDEX)).toBe(main);
  });

  it('no name shared: says nothing of the link, as main', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: linkedOrders(() => 'billing-tables.ts'),
      branch: (project) => stored(project, 'shipping', 'Invoice'),
    });

    const { previewed, merged, main } = bothRuns(root);
    const registry = [{ file: INDEX, kind: 'registry', how: 'generated registry: the lines of both sides kept' }];

    expect({ previewed, merged }).toEqual({ previewed: registry, merged: registry });
    expect(read(root, INDEX)).toBe(main);
  });
});

describe('merge-trunk, the tables file of shipping a link to a file whose tables both sides change', () => {
  it('reads no table of the link, phantom or not: both runs say the same, nothing is settled', () => {
    const tables = path.join(path.dirname(SHIPPING), 'db/shipping-tables.ts');

    const replaced = (table: string) => (project: string) =>
      write(
        project,
        tables,
        read(project, tables).replace(
          /^export const crates = [\s\S]*?\n\}\);\n/m,
          `export const ${table} = shippingSchema.table('${table}', { id: text('id').primaryKey() });\n`,
        ),
      );

    const root = twoSides({
      orm: 'drizzle',
      base: (project) => {
        expectOk(cli(project, 'generate', 'read-model', 'shipping', 'Crates'));
        fs.mkdirSync(path.join(project, path.dirname(tables)), { recursive: true });
        fs.renameSync(path.join(project, SHIPPING), path.join(project, tables));
        fs.symlinkSync('db/shipping-tables.ts', path.join(project, SHIPPING));
      },
      trunk: (project) => {
        replaced('boxes')(project);
        stored(project, 'billing', 'Crate');
      },
      branch: replaced('bins'),
    });

    const { previewed, merged, main } = bothRuns(root);

    // No name is shared with what the link points at: nothing to settle, nothing said, as main.
    expect(said(previewed)).not.toContain('lists the name `crates` of shipping');
    expect(said(merged)).not.toContain('lists the name');
    expect(previewed).toEqual(merged);
    expect(read(root, INDEX)).toBe(main);
  });
});

describe('generate and init --force, a tables file that is a symbolic link', () => {
  function linkedProject(): string {
    const root = initProject('--orm', 'drizzle', ...CONTEXTS, '--package-manager', 'npm');

    linkedOrders(() => 'billing-tables.ts')(root);

    return root;
  }

  it('generate writes no name while it stands, and says why', () => {
    const root = linkedProject();
    const said = cli(root, 'generate', 'aggregate', 'shipping', 'Order', '--term', 'Order=What shipping keeps').stdout;
    const stored = `${said}\n${cli(root, 'generate', 'repository', 'shipping', 'Order').stdout}`;

    expect(stored).toContain(LINKED(BILLING));
    expect(read(root, INDEX)).not.toContain('as shippingOrders');
  });

  it('a link that points at nothing: generate goes on, and writes no name it cannot prove free', () => {
    const root = initProject('--orm', 'drizzle', ...CONTEXTS, '--package-manager', 'npm');

    linkedOrders(() => 'nowhere.ts')(root);

    const generated = cli(root, 'generate', 'aggregate', 'shipping', 'Order', '--term', 'Order=What shipping keeps');

    expect(generated.code, generated.stderr).toBe(0);
    expect(read(root, INDEX)).not.toContain('as shippingOrders');
  });

  it('init --force writes no name while it stands, and says why', () => {
    const root = linkedProject();

    stored(root, 'shipping', 'Order');
    write(root, INDEX, read(root, INDEX).replace(/^export \{ orders.*\n/gm, ''));

    const forced = forcedInit(root);

    expect(forced.stdout).toContain(LINKED(BILLING));
    expect(read(root, INDEX)).not.toContain('as shippingOrders');
  });
});

describe('merge-trunk --continue, a note whose condition no longer holds', () => {
  it('is not said again: what the merge says of the names is what holds at that run', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => stored(project, 'billing', 'Order'),
      branch: (project) => {
        stored(project, 'billing', 'Invoice');
        stored(project, 'shipping', 'Order');
      },
    });

    const unread = 'export const one = 1,\n  two = 2;\n';

    mergeTrunk(root);
    resolveKeepingBoth(root);
    // The person takes the trunk's tables file of billing and adds a statement the kit does not read: the merge stops on the lines of the branch it lost.
    write(root, BILLING, `${git(root, 'show', `main:${BILLING}`)}${unread}`);
    git(root, 'add', '--all');

    expect(goOn(root, '--continue').stdout).toContain('Each table of that name needs a line by name in the index');

    write(root, BILLING, read(root, BILLING).replace(unread, ''));
    git(root, 'add', '--all');

    const continued = goOn(root, '--continue', '--accept-lost', '--json');
    const report: { automatic: readonly { file: string; how: string }[] } = JSON.parse(continued.stdout);

    const said = report.automatic
      .filter(({ file }) => file === INDEX)
      .map(({ how }) => how)
      .join('\n');

    expect(said).not.toContain('does not read with certainty');
    expect(said).toContain('lists the name `orders` of shipping as `shippingOrders`');
  });
});
