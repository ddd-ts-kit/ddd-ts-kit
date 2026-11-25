import fs from 'node:fs';
import path from 'node:path';
import { migrationFoldersIn } from '../../check/migrations/migrations-in';
import { filesOfCommit } from './files-of-commit';
import { inOrder } from './in-order';
import type { MigrationTool } from './migration-tool';
import { numberedName } from './numbered-name';
import type { OrderedMigration } from './ordered-migration';
import { renumberedName } from './renumbered-name';

const FOLDER = 'prisma/migrations';
const STATEMENTS = 'migration.sql';

const folder: MigrationTool['folder'] = (root) => migrationFoldersIn(root, FOLDER);

/** Prisma sorts the names of its folders. */
const comesAfter: MigrationTool['comesAfter'] = (key, previous) => key > previous;

/**
 * The migrations of Prisma: the folders that hold a `migration.sql`, run in the order of their
 * names. The number of a migration is the timestamp the name of its folder starts with.
 */
export const namedFolders: MigrationTool = {
  name: 'Prisma',
  folder,
  inTree: (root) =>
    inOrder(
      comesAfter,
      folder(root)
        .migrations.filter(({ file }) => fs.existsSync(path.join(root, file)))
        .map((migration) => ({ ...migration, key: migration.name })),
    ),
  inCommit: (root, commit) => inOrder(comesAfter, filesOfCommit(root, commit, FOLDER).flatMap(folderOf)),
  comesAfter,
  lowestNumber: '0'.repeat(14),
  numberOf: ({ name }) => numberedName(name)?.number ?? '',
  numbered(migration, number) {
    const name = renumberedName(migration.name, number) ?? `${number}_${migration.name}`;
    const folders = path.posix.dirname(path.posix.dirname(migration.file));

    return { name, file: `${path.posix.join(folders, name)}/${STATEMENTS}`, key: name };
  },
  generatedAs: (what) => what,
  underOldName:
    'still knows it by the old one: reset it, or record the new name as applied with `npx prisma migrate resolve --applied <new name>`',
};

/** The statements of a folder at the top of the migrations: what makes it one. */
function folderOf(file: string): OrderedMigration[] {
  const [name = '', held, ...deeper] = file.slice(FOLDER.length + 1).split('/');

  return held === STATEMENTS && deeper.length === 0 ? [{ name, file, key: name }] : [];
}
