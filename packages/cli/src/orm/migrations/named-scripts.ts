import { migrationFilesIn } from '../../check/migrations/migrations-in';
import { filesOfCommit } from './files-of-commit';
import { inOrder } from './in-order';
import type { MigrationTool } from './migration-tool';
import { numberedName } from './numbered-name';
import type { OrderedMigration } from './ordered-migration';
import { renumberedName } from './renumbered-name';
import { scriptNamed } from './script-named';
import { SCRIPTS } from './scripts';

const folder: MigrationTool['folder'] = (root) => migrationFilesIn(root, SCRIPTS.folder, SCRIPTS.extensions);

/** knex sorts the names of its scripts. */
const comesAfter: MigrationTool['comesAfter'] = (key, previous) => key > previous;

/**
 * The migrations of knex: every script of the folder, whatever its name, run in the order of the
 * names. The number of a migration is the timestamp its name starts with.
 */
export const namedScripts: MigrationTool = {
  name: 'knex',
  folder,
  inTree: (root) =>
    inOrder(
      comesAfter,
      folder(root).migrations.map((migration) => ({ ...migration, key: migration.name })),
    ),
  inCommit: (root, commit) => inOrder(comesAfter, filesOfCommit(root, commit, SCRIPTS.folder).flatMap(scriptOf)),
  comesAfter,
  lowestNumber: '0'.repeat(14),
  numberOf: ({ name }) => numberedName(name)?.number ?? '',
  numbered(migration, number) {
    const name = renumberedName(migration.name, number) ?? `${number}_${migration.name}`;

    return { name, file: scriptNamed(migration.file, name), key: name };
  },
  generatedAs: (what) => what,
  underOldName:
    'then refuses every migration (`The migration directory is corrupt, the following files are missing`): reset it, or set `name` of its row in `knex_migrations` to the new file name, extension included',
};

/** A script at the top of the folder: knex does not look deeper. */
function scriptOf(file: string): OrderedMigration[] {
  const entry = file.slice(SCRIPTS.folder.length + 1);
  const name = entry.replace(SCRIPTS.extension, '');

  return entry.includes('/') || name === entry ? [] : [{ name, file, key: name }];
}
