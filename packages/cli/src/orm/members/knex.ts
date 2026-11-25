import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { namedScripts } from '../migrations/named-scripts';
import type { OrmMember } from '../orm-member';
import { declaredInTablesFile } from '../tables/declared-in-tables-file';

export const knex: OrmMember = {
  migrations: renamedAfterTrunk(namedScripts),
  /** A function per context creates its tables, beside the types of its rows: the index lists the functions. */
  tables: declaredInTablesFile({
    templates: 'knex',
    file: (context) => `create-${context}-tables.schema`,
    starts: (context) => [
      { file: `${context}.schema`, template: 'schema.ts.tpl' },
      { file: `create-${context}-tables.schema`, template: 'tables.ts.tpl' },
    ],
    entries: ({ context, file }) => [
      { listed: { file, constant: `create${context.pascal}Tables` }, constant: `create${context.pascal}Tables` },
    ],
  }),
};
