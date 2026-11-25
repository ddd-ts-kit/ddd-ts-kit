import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { stampedClasses } from '../migrations/stamped-classes';
import type { OrmMember } from '../orm-member';
import { declaredInTablesFile } from '../tables/declared-in-tables-file';
import { listedEntities } from '../tables/listed-entities';

const ENTITY = /^export const (\w+) = new EntitySchema\b/gm;

export const typeorm: OrmMember = {
  database: { token: 'TypeOrmContext', tokenPackage: '@ddd-ts-kit/typeorm', opensWithPromise: true },
  migrations: renamedAfterTrunk(stampedClasses),
  /** The index imports each entity of a tables file and lists it in `entities`. */
  tables: declaredInTablesFile({
    templates: 'typeorm',
    file: (context) => `${context}.schema`,
    starts: (context) => [{ file: `${context}.schema`, template: 'schema.ts.tpl' }],
    entries: ({ file, tables }) =>
      [...tables.matchAll(ENTITY)].map(([, entity = '']) => ({ listed: { file, constant: entity }, constant: entity })),
    indexNames: listedEntities,
  }),
};
