import type { OrmStack } from '../../config';
import { ORM_MEMBERS } from '../../orm/orm-members';
import type { MigrationFolder } from './migration-folder';

/** Where the migration tool of a generated project writes its migrations; undefined without one. */
export function readMigrationFolder(root: string, orm: OrmStack): MigrationFolder | undefined {
  return ORM_MEMBERS[orm].migrations?.folder(root);
}
