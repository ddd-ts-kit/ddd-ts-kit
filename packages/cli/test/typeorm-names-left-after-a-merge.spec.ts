import { describe, expect, it } from 'vitest';
import { read, write } from './helpers';
import { asMainLeavesIt } from './support/as-main-leaves-it';
import { forcedInit } from './support/forced-init';
import { git } from './support/git';
import { CONTEXTS, INDEX, store } from './support/index-invariant';
import { loadedIndex } from './support/index-tables';
import { initProject } from './support/init-project';
import { mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const BILLING = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';
const SHIPPING = 'src/contexts/shipping/infrastructure/persistence/shipping.schema.ts';

const IMPORTED_TWICE = `${INDEX}: imports \`orders\` 2 times (from ${SHIPPING}, ${BILLING}); the kit writes no name on TypeORM after a merge: if they are distinct entities, import each but one under its own name and list that name in \`entities\`; if they are one entity, take out the extra import.`;

function sharedName(): string {
  return twoSides({
    orm: 'typeorm',
    trunk: (project) => void store(project, 'billing', 'Order'),
    branch: (project) => void store(project, 'shipping', 'Order'),
  });
}

function timesSaid(said: string, sentence: string): number {
  return said.split(sentence).length - 1;
}

describe('merge-trunk on TypeORM, a name both sides import', () => {
  it('(a) leaves the index as the merge wrote it, says the name once, in the dry run as in the merge, and writes no trailer of the kit', () => {
    const root = sharedName();
    const main = asMainLeavesIt(root);
    const previewed = mergeTrunk(root, '--dry-run');
    const merged = mergeTrunk(root);

    expect(timesSaid(previewed.stdout, IMPORTED_TWICE.replace(`${INDEX}: `, ''))).toBe(1);
    expect(timesSaid(merged.stdout, IMPORTED_TWICE.replace(`${INDEX}: `, ''))).toBe(1);
    expect(merged.code, merged.stdout).toBe(0);
    expect(read(root, INDEX)).toBe(main);
    expect(git(root, 'log', '-1', '--format=%B')).not.toMatch(/Kit-Written|Lost-Accepted/);
  });

  it('(b) init --force on the merged index writes no name either, and says it once', () => {
    const root = sharedName();

    mergeTrunk(root);

    const merged = read(root, INDEX);
    const forced = forcedInit(root);

    expect(read(root, INDEX)).toBe(merged);
    expect(timesSaid(forced.stdout, IMPORTED_TWICE)).toBe(1);
  });
});

describe('merge-trunk on TypeORM, no name imported twice', () => {
  it('(c) says nothing of the index, a line read by a team included', () => {
    const root = twoSides({
      orm: 'typeorm',
      trunk: (project) => void store(project, 'billing', 'Order'),
      branch: (project) => {
        store(project, 'shipping', 'Invoice');

        write(
          project,
          INDEX,
          `${read(project, INDEX)}import { invoices as invoiceView } from '@/contexts/shipping/infrastructure/persistence/shipping.schema';\nexport const nameOk = /^[a-z_]+$/.test(invoiceView.options.name);\n`,
        );
      },
    });

    const main = asMainLeavesIt(root);
    const merged = mergeTrunk(root, '--json');

    // As main answers: the index is merged as a registry, and nothing more is said of it.
    expect(merged.code, merged.stdout).toBe(0);

    expect(merged.json()).toMatchObject({
      automatic: [{ file: INDEX, kind: 'registry', how: 'generated registry: the lines of both sides kept' }],
      leftOut: [],
    });

    expect(merged.stdout).not.toContain('the kit writes no name');
    expect(read(root, INDEX)).toBe(main);
  });
});

describe('generate on TypeORM, a second table of one name', () => {
  it('(d) imports it under an alias of its own and lists it: each entity once', async () => {
    const root = initProject('--orm', 'typeorm', ...CONTEXTS, '--package-manager', 'npm');

    store(root, 'billing', 'Order');
    store(root, 'shipping', 'Order');

    const loaded = await loadedIndex(root);

    expect(read(root, INDEX)).toContain('orders as shippingOrders');

    expect({ error: loaded.error, twice: loaded.twice, missing: loaded.missing }).toEqual({
      error: undefined,
      twice: [],
      missing: [],
    });

    expect(loaded.tables.filter((table) => table.endsWith('.orders'))).toEqual(['billing.orders', 'shipping.orders']);
  });
});
