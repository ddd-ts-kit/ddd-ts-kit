import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { commitAll } from './support/commit-all';
import { INDEX } from './support/index-invariant';
import {
  EXTRA,
  expectAsBefore,
  forcedOn,
  hedgedLoss,
  legacyTables,
  project,
  stored,
  tablesOf,
  unreadExtra,
} from './support/legacy-index';
import { mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

describe('the note of a module not read that names none of the names shared (UU1)', () => {
  it('says the name shared among what was read in a clause of its own, never that the module may export it', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    unreadExtra(root, 'legacy');
    commitAll(root);

    const said = stored(root, 'shipping', 'Order');

    expect(said).not.toContain('which may export `orders`');

    expect(said).toContain(
      `\`orders\` is shared by '${tablesOf('billing')}' and '${tablesOf('shipping')}'; the kit writes no name while '${EXTRA}' stands.`,
    );
  });
});

describe('the picture, while a module the index re-exports is not read (UU2)', () => {
  it('(a) still says a table generate --force wrote out of its tables file', () => {
    const root = project();

    stored(root, 'billing', 'Order');
    stored(root, 'billing', 'Crate');
    unreadExtra(root, 'legacy');
    commitAll(root);

    const generated = cli(root, 'generate', 'repository', 'billing', 'Order', '--force');

    expect(generated.stdout).toContain(
      `\`crates\` is no more in ${tablesOf('billing')}, which the command wrote again without it`,
    );
  });

  it('(b) init --force drops a name a line of the team gives as before, and says it hedged', () => {
    const root = project();

    legacyTables(root, 'archived');
    write(root, INDEX, `${read(root, INDEX)}export { archived } from '@/legacy/tables';\n`);
    unreadExtra(root, 'legacy');

    const forced = forcedOn(root);

    expectAsBefore(forced, root, "export { archived } from '@/legacy/tables';");
    expect(forced.stdout).toContain(hedgedLoss('archived', [EXTRA]));
  });

  it('(c) a linked tables file whose text holds no shared name: the clause of the name shared among what was read', () => {
    const root = project();

    stored(root, 'returns', 'Parcel');

    const persistence = path.join(root, path.dirname(tablesOf('returns')));

    fs.renameSync(path.join(root, tablesOf('returns')), path.join(persistence, 'returns-tables.ts'));
    fs.symlinkSync('returns-tables.ts', path.join(root, tablesOf('returns')));
    stored(root, 'billing', 'Order');
    commitAll(root);

    const said = stored(root, 'shipping', 'Order');

    expect(said).not.toContain('which may export `orders`');
    expect(said).toContain(`the kit writes no name while '${tablesOf('returns')}' stands.`);
    expect(said).not.toContain('is left as it stood');
  });
});

describe('the keeper of each name, and a name the index declares itself (UU3, UU4)', () => {
  it('names the keeper of each name on the trunk', () => {
    const root = twoSides({
      orm: 'drizzle',
      base: (side) => unreadExtra(side, 'legacy'),
      trunk: (side) => {
        stored(side, 'billing', 'Order');
        stored(side, 'billing', 'Parcel');
      },
      branch: (side) => {
        stored(side, 'shipping', 'Order');
        stored(side, 'returns', 'Parcel');
      },
    });

    const said = mergeTrunk(root).stdout;

    expect(said).toContain(
      `on the trunk, \`orders\`: '${tablesOf('billing')}'; \`parcels\`: '${tablesOf('billing')}' keep them`,
    );
  });

  it('says the index holds the name itself, and hides a table of that name', () => {
    const root = project();

    unreadExtra(root, 'jobs');
    commitAll(root);

    const said = stored(root, 'billing', 'Job');

    expect(said).toContain('the index itself (`export const jobs`)');
    expect(said).toContain("A table named `jobs` in a tables file is hidden by the index's own `export const jobs`.");
  });
});
