import { replayedAfterTrunk } from '../../merge/replayed-after-trunk';
import type { OrmMember } from '../orm-member';
import { declaredInTablesFile } from '../tables/declared-in-tables-file';
import { exportedNames } from '../tables/exported-names';

export const drizzle: OrmMember = {
  database: { token: 'Database', opensWithPromise: false },
  migrations: replayedAfterTrunk,
  /** The index re-exports the tables file of each context whole. */
  tables: declaredInTablesFile({
    templates: 'drizzle',
    file: (context) => `${context}.schema`,
    starts: (context) => [{ file: `${context}.schema`, template: 'schema.ts.tpl' }],
    entries: ({ context, file }) => [{ listed: { file }, constant: `${context.camel}Schema` }],
    indexNames: exportedNames,
  }),
};
