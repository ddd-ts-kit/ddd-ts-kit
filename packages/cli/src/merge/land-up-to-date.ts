import { isWorkingMigration } from '../check/migrations/is-working-migration';
import type { MigrationHistory } from '../orm/migrations/migration-history';
import { ORM_MEMBERS } from '../orm/orm-members';
import type { MergeContext } from './merge-context';
import type { MergeReport } from './merge-report';
import { NEXT_STEPS } from './next-steps';
import { migrationOrder } from './order/migration-order';

/**
 * `--to-land` on a branch that already holds the trunk (merged by `git merge`, or by `merge-trunk`
 * without `--to-land`): there is no merge to make, and its migrations still have to follow the
 * trunk's. When one sorts before the last of the trunk, is out of the journal of drizzle-kit, or
 * is a working one, they are landed as a merge lands them (replayed under drizzle-kit, renamed
 * elsewhere) and left to commit: no merge commit carries them. A stop leaves the folder as it was
 * found, so that the same command runs again; a dry run says what would move and moves nothing.
 */
export function landUpToDate(
  context: MergeContext,
  report: MergeReport,
  { now = new Date(), dryRun }: { readonly now?: Date; readonly dryRun: boolean },
): MergeReport {
  const { root, config } = context;
  const history = config === undefined ? undefined : ORM_MEMBERS[config.stack.orm].migrations;
  const trunk = { name: report.trunk.ref, commit: report.trunk.commit };
  const toLand = history === undefined ? [] : migrationsToLand(root, history, trunk);

  if (history === undefined || toLand.length === 0) {
    return report;
  }

  const landed = history.landAfterTrunk({ root, trunk: trunk.commit, toLand, now, dryRun });
  const migrations = [...report.migrations, ...landed.lines];

  if (landed.stop !== undefined) {
    return { ...report, status: 'stopped', migrations, stop: landed.stop, next: NEXT_STEPS.migrationsUpToDate };
  }

  return { ...report, migrations, next: dryRun ? NEXT_STEPS.dryRunUpToDate : NEXT_STEPS.landedUpToDate };
}

/** The working migrations of the branch and those that do not follow the trunk's, by name. */
function migrationsToLand(root: string, history: MigrationHistory, trunk: { name: string; commit: string }): string[] {
  return [
    ...new Set([
      ...history
        .addedSince(root, trunk.commit)
        .map(({ name }) => name)
        .filter(isWorkingMigration),
      ...migrationOrder(root, trunk).map(({ migration }) => migration),
    ]),
  ];
}
