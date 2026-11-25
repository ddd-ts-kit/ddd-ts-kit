import type { MigrationHistory } from '../orm/migrations/migration-history';
import type { MigrationTool } from '../orm/migrations/migration-tool';
import { namedOrder } from './order/named-order';
import { renumberMigrations } from './renumber-migrations';

/**
 * The history of a tool that orders its migrations as files (knex, Prisma, TypeORM): one that
 * does not follow the trunk's is renamed with a number after the last of the trunk, its content
 * kept. A merge renames them only when the branch lands: until then a working migration keeps
 * its name.
 */
export function renamedAfterTrunk(tool: MigrationTool): MigrationHistory {
  return {
    folder: (root) => tool.folder(root),
    addedSince(root, trunk) {
      const landed = new Set(tool.inCommit(root, trunk).map(({ file }) => file));

      return tool.inTree(root).filter(({ file }) => !landed.has(file));
    },
    outOfOrder: (root, trunk) => namedOrder(root, tool, trunk),
    landInMerge: ({ root, base, trunk, toLand, now }) =>
      toLand ? renumberMigrations({ root, tool, base, trunk, now }) : { lines: [] },
    landAfterTrunk: ({ root, trunk, now, dryRun }) =>
      renumberMigrations({ root, tool, base: trunk, trunk, now, dryRun }),
  };
}
