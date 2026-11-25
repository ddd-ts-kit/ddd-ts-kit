import { drizzleMigrationFolder } from '../check/migrations/drizzle-migration-folder';
import type { FollowingHistory, MigrationHistory } from '../orm/migrations/migration-history';
import type { MigrationsLanded } from '../orm/migrations/migrations-landed';
import { landDrizzle, replayedOn } from './land-drizzle';
import { migrationsAt } from './migrations-at';
import { appliedUnderOldName, REPLAYED_UNDER_OLD_NAME } from './order/applied-under-old-name';
import { drizzleOrder } from './order/drizzle-order';

/**
 * The history of drizzle-kit, whose journal orders the migrations and whose snapshots chain
 * them: one that does not follow the trunk's is generated again after them, never renamed.
 */
export const replayedAfterTrunk: MigrationHistory = {
  folder: drizzleMigrationFolder,
  addedSince(root, trunk) {
    const { folder, migrations } = drizzleMigrationFolder(root);
    const held = new Set(migrationsAt(root, trunk, { folder, directories: false }).map(({ name }) => name));

    return migrations.filter(({ name }) => !held.has(name));
  },
  outOfOrder: drizzleOrder,
  landInMerge: ({ root, base, ours, trunk, toLand }) => landDrizzle(root, { base, ours, trunk, toLand }),
  landAfterTrunk: replayed,
};

/**
 * The replay of drizzle-kit, which deletes the migrations of the branch before it generates them
 * again: it is asked to put the folder back when it stops in between. A deleted migration left in
 * the tree could only be committed as a deletion, and the command refuses to run again on a
 * changed tree.
 */
function replayed({ root, trunk, toLand, dryRun }: FollowingHistory): MigrationsLanded {
  if (dryRun) {
    return { lines: toLand.map((name) => `${name} would be generated again after the migrations of the trunk`) };
  }

  const landed = replayedOn(root, { trunk, toLand: true, putBack: true });
  const moved = landed.stop === undefined && landed.lines.some((line) => /^(?:Generated|Renamed) /.test(line));

  return moved ? { lines: [...landed.lines, appliedUnderOldName(REPLAYED_UNDER_OLD_NAME)] } : landed;
}
