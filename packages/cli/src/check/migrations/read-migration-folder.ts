import type { OrmStack } from '../../config';
import { drizzleOutFolder } from './drizzle-out-folder';
import type { MigrationFolder } from './migration-folder';
import { migrationFilesIn, migrationFoldersIn } from './migrations-in';

const SCRIPTS = ['.js', '.ts', '.mjs', '.cjs'];

/** Where the migration tool of a generated project writes its migrations; undefined without one. */
export function readMigrationFolder(root: string, orm: OrmStack): MigrationFolder | undefined {
  if (orm === 'drizzle') {
    return migrationFilesIn(root, drizzleOutFolder(root), ['.sql']);
  }

  if (orm === 'knex' || orm === 'typeorm') {
    return migrationFilesIn(root, 'migrations', SCRIPTS);
  }

  return orm === 'prisma' ? migrationFoldersIn(root, 'prisma/migrations') : undefined;
}
