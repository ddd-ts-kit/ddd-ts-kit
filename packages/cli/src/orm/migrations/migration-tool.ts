import type { MigrationFolder } from '../../check/migrations/migration-folder';
import type { OrderedMigration } from './ordered-migration';

/**
 * The migration tool of an ORM whose migrations are files it orders itself: what it takes for a
 * migration, what it orders them by, and where a migration carries its number. `verify-merge` and
 * the landing both ask it here, so that they never disagree.
 */
export interface MigrationTool {
  /** The tool, as a sentence names it. */
  readonly name: string;
  /** Where it writes its migrations, and what the folder holds, by name: not all of it is a migration to the tool. */
  folder(root: string): MigrationFolder;
  /** What it takes for a migration in the working tree, in the order it runs them. */
  inTree(root: string): OrderedMigration[];
  /** The same in a commit, read from git: the trunk a branch has to follow. */
  inCommit(root: string, commit: string): OrderedMigration[];
  /** Whether it runs a migration after another, by their keys. */
  comesAfter(key: string, previous: string): boolean;
  /** The number every migration comes after, in its format. */
  readonly lowestNumber: string;
  /** The number a migration carries; none when it carries none. */
  numberOf(migration: Pick<OrderedMigration, 'key' | 'name'>): string;
  /** What a migration is once it carries `number`: its name, its file, and what the tool orders it by. */
  numbered(migration: OrderedMigration, number: string): OrderedMigration;
  /** Writes the number inside the file, where the tool reads it there; absent when the name alone carries it. */
  readonly stamp?: (file: string, number: string) => void;
  /** What `npm run db:generate` is given to write a migration again under what it does. */
  generatedAs(what: string): string;
  /** What a database that already applied a migration under its old name does of the new one, and what settles it. */
  readonly underOldName: string;
}
