import { describe, expect, it } from 'vitest';
import { read, write } from '../helpers';
import {
  base,
  bothSidesAddATable,
  store,
  TABLES,
  tablesFileOf,
  withPrismaClient,
} from '../support/both-sides-add-a-table';
import { COLUMN_STACKS, columnAndTable, hunkOf, withColumn } from '../support/column-and-table';
import { git } from '../support/git';
import { goOn, mergeTrunk } from '../support/trunk-history';
import { twoSides } from '../support/two-sides';
import { generatePrismaClient } from './generate-prisma-client';
import { SLOW } from './stacks';
import { typeErrors } from './type-errors';

const CASES = [
  { orm: 'drizzle', layout: 'flat', modules: false },
  { orm: 'drizzle', layout: 'laid out in modules', modules: true },
  { orm: 'typeorm', layout: 'flat', modules: false },
  { orm: 'typeorm', layout: 'laid out in modules', modules: true },
  { orm: 'knex', layout: 'flat', modules: false },
  { orm: 'prisma', layout: 'flat', modules: false },
];

/** Slow, opt-in (DDD_TS_KIT_E2E=1): the project a merge leaves when both sides added a table to one context, read by the compiler. */
describe.runIf(SLOW)('merge-trunk, when the trunk and the branch each added a table to one context', () => {
  it.each(CASES)(
    'leaves a project that type-checks on $orm, the context $layout',
    ({ orm, modules }) => {
      const root = bothSidesAddATable(orm, modules);
      const merged = mergeTrunk(root);
      const tables = read(root, tablesFileOf(root, orm));

      expect(merged.code, merged.stdout).toBe(0);
      expect(merged.stdout).toContain('committed');

      for (const declared of TABLES[orm] ?? []) {
        expect(tables).toContain(declared);
      }

      if (orm === 'prisma') {
        withPrismaClient(root);
        generatePrismaClient(root);
      }

      expect(typeErrors(root)).toBe('');
    },
    180_000,
  );

  it('leaves a project that type-checks on TypeORM when the type arguments of each entity are wrapped and the trunk edits one', () => {
    const wrapped = (root: string): void => {
      const file = tablesFileOf(root, 'typeorm');

      write(root, file, read(root, file).replace(/new EntitySchema<(\w+)>\(\{/g, 'new EntitySchema<\n  $1\n>({'));
    };

    const root = twoSides({
      orm: 'typeorm',
      base: (project) => {
        base(false)(project);
        wrapped(project);
      },
      branch: (project) => {
        store(project, 'Invoice');
        wrapped(project);
      },
      trunk: (project) => {
        const file = tablesFileOf(project, 'typeorm');

        store(project, 'Refund');
        wrapped(project);
        // The last lines of the first entity, which the two entities added below it share.
        write(project, file, read(project, file).replace('  },\n});', '  },\n  synchronize: false,\n});'));
      },
    });

    const merged = mergeTrunk(root);
    const tables = read(root, tablesFileOf(root, 'typeorm'));

    expect(merged.code, merged.stdout).toBe(0);
    expect(tables.match(/^export const \w+ = new EntitySchema<\n {2}\w+\n>\(\{$/gm)).toHaveLength(3);
    expect(tables).toContain('synchronize: false');
    expect(typeErrors(root)).toBe('');
  }, 180_000);
});

/** Slow, opt-in (DDD_TS_KIT_E2E=1): the project left once the one hunk of a table both sides added a column to is settled, read by the compiler. */
describe.runIf(SLOW)('merge-trunk, when the branch added a column to a table and stored an aggregate below it', () => {
  it.each(COLUMN_STACKS)(
    'stops on the table alone on $orm, and leaves a project that type-checks once both columns are written in it',
    (stack) => {
      const { orm, column, added } = stack;
      const root = columnAndTable(stack, (project) => withColumn(project, stack, 'sentTo'));
      const file = tablesFileOf(root, orm);
      const stopped = mergeTrunk(root);
      const text = read(root, file);
      const { hunk, ours } = hunkOf(text);
      const both = `${column('paidBy')}\n${column('sentTo')}`;

      expect(stopped.code, stopped.stdout).toBe(1);
      expect(stopped.stdout).toContain('stopped: 1 conflicted path left for you');
      // The table the branch stored below is whole, without the column of the trunk: its mapper is read as generated.
      expect(added.exec(text)?.[0]).not.toContain('sentTo');

      write(root, file, text.replace(hunk, ours.replace(column('paidBy'), both)));

      if (orm === 'drizzle') {
        // The row of Drizzle is read from the table: the mapper of the orders gives the two columns a value.
        const mapper = file.replace('billing.schema.ts', 'order.mapper.ts');

        write(
          root,
          mapper,
          read(root, mapper).replace('{ id: saved.id,', '{ id: saved.id, paidBy: null, sentTo: null,'),
        );

        git(root, 'add', mapper);
      }

      git(root, 'add', file);

      expect(goOn(root, '--continue').stdout).toContain('committed');
      expect(read(root, file)).toContain(both);
      expect(typeErrors(root)).toBe('');
    },
    180_000,
  );
});
