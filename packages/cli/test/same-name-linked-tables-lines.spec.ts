import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, read, tempDir, write } from './helpers';
import { asMainLeavesIt } from './support/as-main-leaves-it';
import { commitAll } from './support/commit-all';
import { expectOk } from './support/expect-ok';
import { forcedInit } from './support/forced-init';
import { CONTEXTS, INDEX } from './support/index-invariant';
import { initProject } from './support/init-project';
import { mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const BILLING = 'src/contexts/billing/infrastructure/persistence/billing.schema.ts';

function stored(project: string, context: string, aggregate: string): string {
  const declared = expectOk(
    cli(project, 'generate', 'aggregate', context, aggregate, '--term', `${aggregate}=What ${context} keeps`),
  );

  return `${declared.stdout}\n${expectOk(cli(project, 'generate', 'repository', context, aggregate)).stdout}`;
}

/** billing's tables file moved beside it and replaced by a link to it. */
function linked(project: string): void {
  const moved = path.join(project, path.dirname(BILLING), 'billing-tables.ts');

  fs.renameSync(path.join(project, BILLING), moved);
  fs.symlinkSync('billing-tables.ts', path.join(project, BILLING));
}

const SHIPPING = 'src/contexts/shipping/infrastructure/persistence/shipping.schema.ts';
const LINKED = `'${BILLING}', a symbolic link, which the kit does not follow`;
const MUST_HOLD = 'Each table of that name needs a line by name in the index';

/** The note of a file not read that may share `orders`: what it does not read, who holds the name, who keeps it. */
function unreadNote(reason: string, holder: string, keeper: string): string {
  return `${INDEX}: the kit wrote no name in it: it does not read with certainty ${reason}, which may export \`orders\`, as '${holder}' does. ${MUST_HOLD}: the one that held \`orders\` before${keeper} keeps it, each other one takes a name of its own.`;
}

describe('a file the index re-exports not read, that may share a name with a tables file', () => {
  it('says what must hold, with no line to copy, the same in generate and init --force, the picture saying nothing (B2)', () => {
    const root = initProject('--orm', 'drizzle', ...CONTEXTS, '--package-manager', 'npm');

    stored(root, 'billing', 'Order');
    linked(root);
    commitAll(root);

    const generated = stored(root, 'shipping', 'Order');
    const note = unreadNote(LINKED, SHIPPING, '');

    expect(generated).toContain(note);
    expect(generated).not.toContain('To write by hand');
    expect(generated).not.toContain('is left as it stood');
    expect(forcedInit(root).stdout).toContain(note);
  });

  it('a module that is no tables file, not read: the same note, no line to copy', () => {
    const root = initProject('--orm', 'drizzle', ...CONTEXTS, '--package-manager', 'npm');

    stored(root, 'billing', 'Order');

    write(
      root,
      'src/legacy/extra.ts',
      "import { pgTable, text } from 'drizzle-orm/pg-core';\n\nconst tables = { orders: pgTable('legacy_orders', { id: text('id').primaryKey() }) };\n\nexport const { orders } = tables;\n",
    );

    write(
      root,
      INDEX,
      read(root, INDEX).replace(
        '// /ddd-ts-kit:schemas',
        "export * from '../../legacy/extra';\n// /ddd-ts-kit:schemas",
      ),
    );

    commitAll(root);

    const generated = stored(root, 'shipping', 'Parcel');

    expect(generated).toContain('it does not read with certainty src/legacy/extra.ts');
    expect(generated).toContain(`which may export \`orders\`, as '${BILLING}' does. ${MUST_HOLD}`);
    expect(generated).not.toContain('To write by hand');
  });
});

describe('merge-trunk, a linked tables file on either side', () => {
  /** What the dry run, then the real run, say of the schema index. */
  function bothRuns(root: string): { previewed: string[]; merged: string[]; main: string } {
    const ofIndex = (stdout: string): string[] => {
      const report: { automatic: readonly { file: string; how: string }[] } = JSON.parse(stdout);

      return report.automatic.filter(({ file }) => file === INDEX).map(({ how }) => how);
    };

    const main = asMainLeavesIt(root);
    const previewed = ofIndex(mergeTrunk(root, '--dry-run', '--json').stdout);

    return { previewed, merged: ofIndex(mergeTrunk(root, '--json').stdout), main };
  }

  const linkedBilling = (project: string): void => {
    stored(project, 'billing', 'Order');
    linked(project);
  };

  it.each([
    ['the trunk', true, 'as the index of the trunk exports it'],
    ['the branch', false, `'${SHIPPING}'`],
  ])(
    'linked on %s: the note names the trunk as the keeper, nothing is written, the same in both runs',
    (_side, onTrunk, keeper) => {
      const shippingOrder = (project: string): void => void stored(project, 'shipping', 'Order');

      const root = twoSides({
        orm: 'drizzle',
        trunk: onTrunk ? linkedBilling : shippingOrder,
        branch: onTrunk ? shippingOrder : linkedBilling,
      });

      const { previewed, merged, main } = bothRuns(root);

      expect(merged.join('\n')).toContain(
        `${MUST_HOLD}: the one that held \`orders\` on the trunk, ${keeper}, keeps it`,
      );

      expect(merged.join('\n')).not.toContain('To write by hand');
      expect(previewed).toEqual(merged);
      expect(read(root, INDEX)).toBe(main);
    },
  );

  it('the trunk not read, the merged tree read: what the merge would write is taken back, the note says what must hold', () => {
    const unread = 'export const one = 1,\n  two = 2;\n';

    const root = twoSides({
      orm: 'drizzle',
      base: (project) => {
        stored(project, 'billing', 'Order');
        write(project, BILLING, `${read(project, BILLING)}${unread}`);
      },
      trunk: (project) => void stored(project, 'shipping', 'Order'),
      branch: (project) => write(project, BILLING, read(project, BILLING).replace(unread, '')),
    });

    const { previewed, merged, main } = bothRuns(root);

    expect(merged.join('\n')).toContain(`${MUST_HOLD}: the one that held \`orders\` on the trunk`);
    expect(merged.join('\n')).toContain('does not read with certainty on the trunk');
    expect(merged.join('\n')).not.toContain('To write by hand');
    expect(previewed).toEqual(merged);
    expect(read(root, INDEX)).toBe(main);
  });

  it('B1: the trunk not read, the branch giving `orders` by line to shipping: the trunk keeps it, nothing is written', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: linkedBilling,
      branch: (project) => {
        stored(project, 'shipping', 'Order');

        write(
          project,
          INDEX,
          read(project, INDEX).replace(
            '// /ddd-ts-kit:schemas',
            "export { orders } from '@/contexts/shipping/infrastructure/persistence/shipping.schema';\n// /ddd-ts-kit:schemas",
          ),
        );
      },
    });

    const { previewed, merged, main } = bothRuns(root);

    expect(merged.join('\n')).toContain(
      'the one that held `orders` on the trunk, as the index of the trunk exports it, keeps it',
    );

    expect(merged.join('\n')).not.toContain('To write by hand');
    expect(previewed).toEqual(merged);
    expect(read(root, INDEX)).toBe(main);
  });
});

describe('merge-trunk, the two runs on a link they read the same way', () => {
  /** What the dry run, then the real run, say of the schema index. */
  function bothRuns(root: string): { previewed: string[]; merged: string[] } {
    const ofIndex = (stdout: string): string[] => {
      const report: { automatic: readonly { file: string; how: string }[] } = JSON.parse(stdout);

      return report.automatic.filter(({ file }) => file === INDEX).map(({ how }) => how);
    };

    const previewed = ofIndex(mergeTrunk(root, '--dry-run', '--json').stdout);

    return { previewed, merged: ofIndex(mergeTrunk(root, '--json').stdout) };
  }

  it('a link written absolute through another path of the repository: outside in both', () => {
    const alias = path.join(fs.realpathSync(tempDir('repository-alias')), 'project');

    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => {
        stored(project, 'billing', 'Order');
        fs.symlinkSync(project, alias, 'dir');

        const moved = path.join(project, path.dirname(BILLING), 'billing-tables.ts');

        fs.renameSync(path.join(project, BILLING), moved);
        fs.symlinkSync(path.join(alias, path.dirname(BILLING), 'billing-tables.ts'), path.join(project, BILLING));
      },
      branch: (project) => void stored(project, 'shipping', 'Order'),
    });

    const { previewed, merged } = bothRuns(root);

    expect(merged.join('\n')).not.toContain('lists the name');
    expect(previewed).toEqual(merged);
  });

  it('a folder of the path of a tables file that is a link: the file is not read, in both', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => {
        stored(project, 'billing', 'Order');

        const folder = path.join(project, path.dirname(BILLING));
        const elsewhere = path.join(path.dirname(folder), 'stored');

        fs.renameSync(folder, elsewhere);
        fs.symlinkSync('stored', folder, 'dir');
      },
      branch: (project) => void stored(project, 'shipping', 'Order'),
    });

    const { previewed, merged } = bothRuns(root);

    expect(merged.join('\n')).not.toContain('lists the name');
    expect(previewed).toEqual(merged);
  });
});
