import fs from 'node:fs';
import path from 'node:path';
import type { Migration } from '../../check/migrations/migration-folder';
import { migrationFilesIn } from '../../check/migrations/migrations-in';
import { scan } from '../../check/scan/scan';
import { runGit } from '../../commit/run-git';
import { inOrder } from './in-order';
import type { MigrationTool } from './migration-tool';
import type { OrderedMigration } from './ordered-migration';
import { renumberedName } from './renumbered-name';
import { restampClass } from './restamp-class';
import { scriptNamed } from './script-named';
import { SCRIPTS } from './scripts';

const STAMPED_CLASS = /(?<![\w$.])class\s+[A-Za-z_$][\w$]*?(\d{13})(?![\w$])/;
/** A class whose name ends with 13 digits, for `git grep -E`, which reads a commit without a checkout. */
const STAMPED_CLASS_IN_GIT = 'class[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[0-9]{13}';

const folder: MigrationTool['folder'] = (root) => migrationFilesIn(root, SCRIPTS.folder, SCRIPTS.extensions);

/** TypeORM sorts the stamps of its classes, as numbers. */
const comesAfter: MigrationTool['comesAfter'] = (key, previous) => Number(key) > Number(previous);

/**
 * The migrations of TypeORM: the classes whose name ends with 13 digits, however the file is
 * named, run in the order of those stamps. The number of a migration is the stamp of its class,
 * which a renaming writes in the class too.
 */
export const stampedClasses: MigrationTool = {
  name: 'TypeORM',
  folder,
  inTree: (root) =>
    inOrder(
      comesAfter,
      folder(root).migrations.flatMap((migration) =>
        stamped(migration, fs.readFileSync(path.join(root, migration.file), 'utf8')),
      ),
    ),
  inCommit: (root, commit) =>
    inOrder(
      comesAfter,
      stampedIn(runGit(root, ['grep', '-I', '-o', '-E', STAMPED_CLASS_IN_GIT, commit, '--', SCRIPTS.folder])),
    ),
  comesAfter,
  lowestNumber: '0'.repeat(13),
  numberOf: ({ key }) => key,
  numbered(migration, number) {
    const name = renumberedName(migration.name, number) ?? migration.name;

    return { name, file: scriptNamed(migration.file, name), key: number };
  },
  stamp: restampClass,
  generatedAs: (what) => `${SCRIPTS.folder}/${what}`,
  underOldName:
    'would run it again under the new one: reset it, or correct its row in `migrations` (`timestamp`, and `name`, the class)',
};

function stamped(migration: Migration, text: string): OrderedMigration[] {
  const stamp = STAMPED_CLASS.exec(scan(text).code)?.[1];

  return stamp === undefined ? [] : [{ ...migration, key: stamp }];
}

/** `<commit>:<file>:class <Name><stamp>` on each line of `git grep`; the first class of a file names it. */
function stampedIn(matches: string | undefined): OrderedMigration[] {
  const byFile = new Map<string, OrderedMigration>();

  for (const line of (matches ?? '').split('\n')) {
    const [, file, stamp] = /^[^:]+:(.+):class\s+\S*?(\d{13})$/.exec(line) ?? [];

    if (file !== undefined && stamp !== undefined && SCRIPTS.extension.test(file) && !byFile.has(file)) {
      byFile.set(file, { name: path.posix.basename(file).replace(SCRIPTS.extension, ''), file, key: stamp });
    }
  }

  return [...byFile.values()];
}
