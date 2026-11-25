import { isWorkingMigration } from '../../check/migrations/is-working-migration';
import { appliedUnderOldName } from './applied-under-old-name';
import type { MigrationTool } from '../../orm/migrations/migration-tool';
import type { OrderedMigration } from '../../orm/migrations/ordered-migration';
import type { MigrationOrderFinding } from './migration-order-finding';
import type { TrunkToFollow } from './trunk-to-follow';

/**
 * Under knex, Prisma and TypeORM a migration is a file (a folder under Prisma) the tool orders
 * itself, and each of the three runs whatever the database has not run yet: one that comes
 * before the last of the trunk runs after it where the trunk's is applied, and before it on a new
 * database. What a migration is and what orders it are the tool's: see `MigrationTool`.
 */
export function namedOrder(root: string, tool: MigrationTool, trunk: TrunkToFollow): MigrationOrderFinding[] {
  const onTrunk = tool.inCommit(root, trunk.commit);
  const last = onTrunk.at(-1);

  if (last === undefined) {
    return [];
  }

  const landed = new Set(onTrunk.map((migration) => migration.file));

  return tool
    .inTree(root)
    .filter(({ file, name, key }) => !landed.has(file) && !isWorkingMigration(name) && !tool.comesAfter(key, last.key))
    .map((migration) => beforeTrunk(migration, { tool, last, trunk }));
}

function beforeTrunk(
  { name, file }: OrderedMigration,
  { tool, last, trunk }: { tool: MigrationTool; last: OrderedMigration; trunk: TrunkToFollow },
): MigrationOrderFinding {
  const brought = trunk.merged ? `${trunk.name} being merged already, it` : `it brings ${trunk.name} in and`;

  return {
    kind: 'before-trunk',
    migration: name,
    file,
    trunkLast: last.name,
    text: `the migration "${name}" of this branch sorts before "${last.name}", the last migration of ${trunk.name}: ${tool.name} runs it after "${last.name}" on a database that already applied that one, and before it on a new database, so one history runs in two orders`,
    fix: `Run \`npx ddd-ts-kit merge-trunk --to-land\` before the landing: ${brought} renames the migration with a number after "${last.name}", its content kept. When it changes a table a later migration of ${trunk.name} changes too, or when "${last.name}" carries no number a migration can follow, the command stops and says what to do. ${appliedUnderOldName(tool.underOldName)}`,
  };
}
