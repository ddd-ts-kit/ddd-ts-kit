import type { MigrationHistory } from './migrations/migration-history';

/**
 * What the CLI asks of one ORM of the family. A member answers each question itself; what it has
 * no answer to is absent, and the caller does nothing for it.
 */
export interface OrmMember {
  /** The migrations the kit generates for it and keeps in the order of the trunk; absent where it generates none. */
  readonly migrations?: MigrationHistory;
}
