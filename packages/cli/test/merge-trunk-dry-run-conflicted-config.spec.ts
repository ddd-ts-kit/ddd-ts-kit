import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { expectOk } from './support/expect-ok';
import { INDEX, store } from './support/index-invariant';
import { mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const CONFIG = 'ddd-ts-kit.config.json';

/** Writes another `initVersion` in the configuration: both sides doing so leave it conflicted in the merged tree. */
function initVersion(project: string, version: string): void {
  const config: Record<string, unknown> = JSON.parse(read(project, CONFIG));

  write(project, CONFIG, `${JSON.stringify({ ...config, initVersion: version }, null, 2)}\n`);
}

/** A context added on one side, storing one aggregate. */
function contextStoring(project: string, context: string, aggregate: string): void {
  expectOk(
    cli(project, 'generate', 'context', context, '--classification', 'supporting', '--purpose', `Keeps ${context}.`),
  );

  store(project, context, aggregate);
}

/** One entry the report lists under `automatic`. */
interface Automatic {
  readonly file: string;
  readonly kind: string;
  readonly how: string;
}

/** What a dry run says, as text, and what it lists under `automatic` for the schema index. */
function previewed(root: string): { text: string; automatic: readonly Automatic[] } {
  const text = mergeTrunk(root, '--dry-run').stdout;
  const json: { automatic: readonly Automatic[] } = JSON.parse(mergeTrunk(root, '--dry-run', '--json').stdout);

  return { text, automatic: json.automatic.filter(({ file }) => file === INDEX) };
}

describe('merge-trunk --dry-run, a configuration both sides changed', () => {
  it('on TypeORM, no name shared: says nothing of the index but what the merge does to it', () => {
    const root = twoSides({
      orm: 'typeorm',
      trunk: (project) => {
        store(project, 'billing', 'Order');
        initVersion(project, '0.112.0-trunk');
      },
      branch: (project) => {
        store(project, 'shipping', 'Invoice');
        initVersion(project, '0.112.0-branch');
      },
    });

    const { text, automatic } = previewed(root);

    expect(text).toContain(CONFIG);
    expect(text).not.toContain('could not be previewed');
    expect(text).not.toContain('the kit writes no name');

    expect(automatic).toEqual([
      { file: INDEX, kind: 'registry', how: 'generated registry: the lines of both sides kept' },
    ]);
  });

  it('on Drizzle, each side adding a context, no name shared: says nothing of the index but what the merge does to it', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => contextStoring(project, 'invoicing', 'Charge'),
      branch: (project) => contextStoring(project, 'payments', 'Refund'),
    });

    const { text, automatic } = previewed(root);

    expect(text).toContain(CONFIG);
    expect(text).not.toContain('could not be previewed');

    expect(automatic).toEqual([
      { file: INDEX, kind: 'registry', how: 'generated registry: the lines of both sides kept' },
    ]);
  });

  it('on Drizzle, each side adding a context that stores a table of one name: still previews the name it settles', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => contextStoring(project, 'invoicing', 'Order'),
      branch: (project) => contextStoring(project, 'payments', 'Order'),
    });

    const { text } = previewed(root);

    expect(text).not.toContain('could not be previewed');
    expect(text).toMatch(/lists the name `orders` of .* as `paymentsOrders`/);
  });

  it('reads the configuration of the branch when the one of the trunk is no configuration at all', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => {
        store(project, 'billing', 'Order');
        write(project, CONFIG, '{ "contexts": ');
      },
      branch: (project) => store(project, 'shipping', 'Order'),
    });

    const { text } = previewed(root);

    expect(text).not.toContain('could not be previewed');
    expect(text).toContain('lists the name `orders`');
  });

  it.each([
    ['gives one name to two tables', 'Order', true],
    ['gives no name to two tables', 'Invoice', false],
  ])(
    'when the configuration of the merge is no configuration, says so only when the two sides %s',
    (_what, onBranch, isSaid) => {
      const root = twoSides({
        orm: 'drizzle',
        trunk: (project) => {
          store(project, 'billing', 'Order');

          write(project, CONFIG, read(project, CONFIG).replace('"orm": "drizzle"', '"orm": "not-an-orm"'));
        },
        branch: (project) => {
          store(project, 'shipping', onBranch);
          initVersion(project, '0.112.0-branch');
        },
      });

      const { text, automatic } = previewed(root);

      expect(text.includes('what the merge would settle in it could not be previewed (')).toBe(isSaid);
      expect(text).not.toContain('lists the name');
      expect(automatic.length).toBe(isSaid ? 2 : 1);
    },
  );
});

describe('merge-trunk --dry-run, a temporary folder it cannot write in', () => {
  /** A dry run with TMPDIR at a folder that does not exist: the dry run writes nothing, a copy of the tree included. */
  function withoutTemporaryFolder<Result>(run: () => Result): Result {
    const held = process.env['TMPDIR'];

    process.env['TMPDIR'] = '/nonexistent/ddd-ts-kit-dry-run';

    try {
      return run();
    } finally {
      if (held === undefined) {
        delete process.env['TMPDIR'];
      } else {
        process.env['TMPDIR'] = held;
      }
    }
  }

  it.each(['drizzle', 'typeorm'])(
    'on %s, no name shared: exits 0 and says nothing of the index but the merge',
    (orm) => {
      const root = twoSides({
        orm,
        trunk: (project) => store(project, 'billing', 'Order'),
        branch: (project) => store(project, 'shipping', 'Invoice'),
      });

      const text = withoutTemporaryFolder(() => mergeTrunk(root, '--dry-run'));
      const json = withoutTemporaryFolder(() => mergeTrunk(root, '--dry-run', '--json'));
      const { automatic }: { automatic: readonly Automatic[] } = JSON.parse(json.stdout);

      expect({ text: text.code, json: json.code }).toEqual({ text: 0, json: 0 });
      expect(text.stdout).not.toContain('could not be previewed');

      expect(automatic.filter(({ file }) => file === INDEX)).toEqual([
        { file: INDEX, kind: 'registry', how: 'generated registry: the lines of both sides kept' },
      ]);
    },
  );

  it('on Drizzle, a name shared: exits 0 and previews the name, nothing being copied', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => store(project, 'billing', 'Order'),
      branch: (project) => store(project, 'shipping', 'Order'),
    });

    const previewed = withoutTemporaryFolder(() => mergeTrunk(root, '--dry-run'));

    expect(previewed.code).toBe(0);
    expect(previewed.stdout).toContain('lists the name `orders` of shipping as `shippingOrders`');
  });
});

describe('merge-trunk --dry-run, a source of a context that is not UTF-8', () => {
  it('reads every other file as it is: the name of the tables file after it is previewed', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => {
        store(project, 'billing', 'Order');

        // A latin-1 byte in a comment, in a file the batch reads before the tables file of billing.
        fs.writeFileSync(
          path.join(project, 'src/contexts/billing/a-latin.ts'),
          Buffer.concat([Buffer.from('// caf'), Buffer.from([0xe9]), Buffer.from('\nexport const latin = 1;\n')]),
        );
      },
      branch: (project) => store(project, 'shipping', 'Order'),
    });

    const previewed = mergeTrunk(root, '--dry-run');

    expect(previewed.code).toBe(0);
    expect(previewed.stdout).toContain('lists the name `orders` of shipping as `shippingOrders`');
  });
});
