import fs from 'node:fs';
import path from 'node:path';
import { WORKER_SCOPE_FILE } from '../../commit/worker-scope-file';
import { drizzleHistoryFindings } from '../migrations/drizzle-history-findings';
import { migrationNameFindings } from '../migrations/migration-name-findings';
import { readDrizzleMigrations } from '../migrations/read-drizzle-migrations';
import { readMigrationFolder } from '../migrations/read-migration-folder';
import { workingMigrationFindings } from '../migrations/working-migration-findings';
import type { ProjectRule } from '../model/rule';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

export const persistenceMigrationHistory: ProjectRule = {
  id: 'persistence/migration-history',
  description:
    'Every migration is named `<timestamp>_<what-it-does>` and no two share a number; a working migration stays in the worktree of its worker; under drizzle-kit, the journal and the files match, the entries keep the order they were generated in and each snapshot follows the one before it.',
  severity: 'error',
  doc: {
    why: 'Migrations are applied in the order of their names, and several people add them at the same time. Numbered by an index, two branches each write `0002_...` and the order between them is a guess; named by a random word, nobody knows what a migration does. A timestamp and a description, `20261012093000_add-invoices`, keep every branch apart. drizzle-kit adds a journal and a chain of snapshots on top: its migrator applies only the entries newer than the last one a database applied, so an entry merged out of order is skipped without a word, and a snapshot generated from the same parent as another makes the next migration miss a change. After a merge, the migration of the branch is generated again on top of the main branch (under drizzle-kit, `npx ddd-ts-kit drizzle-generate --replay` deletes and generates them again). A worker of a parallel build names the migration it needs `working-<what-it-does>`: its branch runs green in its worktree, and the conductor generates the real one on the trunk, so a working migration found outside a worktree is one that was merged as is.',
    bad: `migrations/
  0002_brave_falcon.sql          # an index, a random name
  0002_quiet_owl.sql             # the same index, from another branch
  meta/_journal.json             # entries 0002 and 0002, two snapshots with one parent`,
    good: `migrations/
  20261010120000_add-invoices.sql
  20261012093000_add-payments.sql   # generated again after main took add-invoices
  meta/_journal.json                # one entry each, in order, each snapshot from the one before`,
  },
  scope: 'project',
  judge(project) {
    const { orm } = project.config.stack;
    const report = reporter(project, this.id);
    const folder = readMigrationFolder(project.root, orm);
    const drizzle = orm === 'drizzle' ? readDrizzleMigrations(project.root) : undefined;
    const migrations = folder?.migrations ?? [];
    // In the worktree of a worker, its working migration is what lets its specs run.
    const inWorker = fs.existsSync(path.join(project.root, WORKER_SCOPE_FILE));

    return [
      ...[...migrationNameFindings(migrations), ...(inWorker ? [] : workingMigrationFindings(migrations))].flatMap(
        ([migration, finding]) => toViolations(report, migration.file, [finding]),
      ),
      ...(drizzle === undefined
        ? []
        : toViolations(report, `${drizzle.folder}/meta/_journal.json`, drizzleHistoryFindings(drizzle))),
    ];
  },
};
