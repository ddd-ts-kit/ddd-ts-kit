import { drizzleOutFolder } from './drizzle-out-folder';
import type { MigrationFolder } from './migration-folder';
import { migrationFilesIn } from './migrations-in';

/** The folder drizzle-kit writes its migrations in, and the SQL files it holds. */
export function drizzleMigrationFolder(root: string): MigrationFolder {
  return migrationFilesIn(root, drizzleOutFolder(root), ['.sql']);
}
