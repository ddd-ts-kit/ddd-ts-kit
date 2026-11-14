import { describe, expect, it } from 'vitest';
import { listedInIndex, warnDroppedContextTables } from '../src/migration';
import { cli, read, write } from './helpers';
import { commitAll } from './support/commit-all';
import { committedProject } from './support/committed-project';
import { expectOk } from './support/expect-ok';
import { git } from './support/git';
import { jsonAt } from './support/json-at';
import { CONTEXTS, INDEX, regionOf, sourceOf, twoContextsOn } from './support/same-name-project';

const BARREL = '@/contexts/shipping';

/** An aggregate of a context with its repository. */
function store(root: string, context: string, aggregate: string): void {
  expectOk(cli(root, 'generate', 'aggregate', context, aggregate, '--term', `${aggregate}=What ${context} keeps`));
  expectOk(cli(root, 'generate', 'repository', context, aggregate));
}

/** The index of a TypeORM project, its imports and its entries replaced by those a team wrote. */
function withIndex(root: string, imports: readonly string[], entities: readonly string[]): void {
  const region = (text: string, name: string, lines: readonly string[]): string =>
    text.replace(
      new RegExp(`(// ddd-ts-kit:${name}\\n)[\\s\\S]*?([ \\t]*// /ddd-ts-kit:${name}\\n)`),
      (_found, open: string, close: string) => `${open}${lines.map((line) => `${line}\n`).join('')}${close}`,
    );

  write(root, INDEX, region(region(read(root, INDEX), 'imports', imports), 'schemas', entities));
}

function warned(root: string): string {
  const lines: string[] = [];

  warnDroppedContextTables(root, { out: () => undefined, err: (text) => lines.push(text) }, 'typeorm');

  return lines.join('\n');
}

describe('an index a team wrote by hand, on TypeORM', () => {
  it('reads as listed an entity imported under an alias through a barrel of its context', () => {
    const index = `import { orders as shippingOrders } from '${BARREL}';\nexport const entities = [shippingOrders];\n`;
    const asked = { file: 'shipping.schema', constant: 'orders' };
    const isOfItsContext = (source: string): boolean => source === BARREL;

    expect(listedInIndex(index, { ...asked, isOfItsContext })).toBe(true);

    expect(listedInIndex(index, { file: 'billing.schema', constant: 'orders', isOfItsContext: () => false })).toBe(
      false,
    );

    expect(listedInIndex(index.replace('[shippingOrders]', '[]'), { ...asked, isOfItsContext })).toBe(false);
  });

  it('neither warns of dropped tables nor adds an import with init --force, the entity coming through a barrel', () => {
    const root = twoContextsOn('typeorm');

    const imports = [
      `import { invoiceSummaries, parcels } from '${sourceOf('billing')}';`,
      `import { invoiceSummaries as shippingInvoiceSummaries, parcels as shippingParcels } from '${BARREL}';`,
    ];

    withIndex(root, imports, ['invoiceSummaries,', 'parcels,', 'shippingInvoiceSummaries,', 'shippingParcels,']);

    write(
      root,
      'migrations/1700000000000-init.ts',
      'await queryRunner.query(`CREATE TABLE "shipping"."parcels" ("id" text)`);\n',
    );

    expect(warned(root)).toBe('');

    commitAll(root);
    expectOk(cli(root, 'init', '--force'));

    expect(regionOf(root, 'imports')).toEqual(imports);
  });

  it('writes no name with init --force for the names two tables files are imported under, and says each once', () => {
    const root = twoContextsOn('typeorm');

    withIndex(
      root,
      [
        `import { invoiceSummaries, parcels } from '${sourceOf('billing')}';`,
        `import { invoiceSummaries, parcels } from '${sourceOf('shipping')}';`,
      ],
      ['invoiceSummaries,', 'parcels,'],
    );

    commitAll(root);

    const imports = regionOf(root, 'imports');
    const forced = expectOk(cli(root, 'init', '--force'));

    for (const name of ['invoiceSummaries', 'parcels']) {
      expect(forced.stdout.split(`imports \`${name}\` 2 times`)).toHaveLength(2);
    }

    expect(regionOf(root, 'imports')).toEqual(imports);
  });

  it('says a name imported twice through a barrel of a context too, with the module it names', () => {
    const root = twoContextsOn('typeorm');

    withIndex(
      root,
      [`import { parcels } from '${sourceOf('billing')}';`, `import { parcels } from '${BARREL}';`],
      ['parcels,'],
    );

    commitAll(root);

    const forced = expectOk(cli(root, 'init', '--force'));

    expect(forced.stdout).toContain(
      'imports `parcels` 2 times (from src/contexts/billing/infrastructure/persistence/billing.schema.ts, ',
    );

    expect(read(root, INDEX)).toContain(`import { parcels } from '${BARREL}';`);
  });
});

describe('verify-slice, on an index whose import of the context is written on several lines', () => {
  it('stages the index on TypeORM: the opening line and each name are those of the context', () => {
    const root = committedProject('same-names-wrapped', ...CONTEXTS, '--package-manager', 'npm', '--orm', 'typeorm');
    const manifest: { scripts: Record<string, string> } = JSON.parse(read(root, 'package.json'));

    manifest.scripts['regenerate'] = 'node -e ""';
    manifest.scripts['test'] = 'node -e ""';
    write(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
    store(root, 'billing', 'Parcel');
    store(root, 'billing', 'Consignment');
    git(root, 'add', '--all');
    git(root, 'commit', '--quiet', '--message', 'feat(billing): store');
    git(root, 'switch', '--quiet', '--create', 'build/shipping');
    store(root, 'shipping', 'Parcel');
    store(root, 'shipping', 'Consignment');

    expect(regionOf(root, 'imports').slice(1)).toEqual([
      'import {',
      'parcels as shippingParcels,',
      'consignments as shippingConsignments,',
      `} from '${sourceOf('shipping')}';`,
    ]);

    const verification = cli(root, 'verify-slice', 'shipping', '--since', 'main', '--json').json();

    expect(jsonAt(verification, 'toStage')).toEqual(expect.arrayContaining([INDEX]));
    expect(jsonAt(verification, 'leftOut')).toEqual([]);
  });
});
