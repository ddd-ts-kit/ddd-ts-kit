import fs from 'node:fs';
import path from 'node:path';
import type { Migration, MigrationFolder } from './migration-folder';

/** The migrations a folder holds as files of the given extensions; a declaration file is not one. */
export function migrationFilesIn(root: string, folder: string, extensions: readonly string[]): MigrationFolder {
  const migrations = entriesOf(path.join(root, folder))
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name)) && !entry.name.endsWith('.d.ts'))
    .map((entry) => ({ name: entry.name.slice(0, -path.extname(entry.name).length), file: `${folder}/${entry.name}` }));

  return { folder, migrations: byName(migrations) };
}

/** The migrations a folder holds as folders, each with the `migration.sql` that holds its statements. */
export function migrationFoldersIn(root: string, folder: string): MigrationFolder {
  const migrations = entriesOf(path.join(root, folder))
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, file: `${folder}/${entry.name}/migration.sql` }));

  return { folder, migrations: byName(migrations) };
}

function byName(migrations: Migration[]): Migration[] {
  return migrations.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function entriesOf(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
