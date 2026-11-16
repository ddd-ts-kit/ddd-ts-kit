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
import { mergeTrunk } from '../support/trunk-history';
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
