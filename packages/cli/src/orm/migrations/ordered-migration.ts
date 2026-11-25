import type { Migration } from '../../check/migrations/migration-folder';

/** A migration with what its tool orders it by. */
export interface OrderedMigration extends Migration {
  /**
   * The name of the file without its extension (knex), the name of the folder (Prisma), or the
   * 13 digits that end the name of the class (TypeORM, which never reads the name of the file).
   */
  readonly key: string;
}
