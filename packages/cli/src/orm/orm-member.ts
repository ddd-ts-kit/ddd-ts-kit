import type { MigrationTool } from './migrations/migration-tool';

/**
 * What the CLI asks of one ORM of the family. A member answers each question itself; what it has
 * no answer to is absent, and the caller does nothing for it.
 */
export interface OrmMember {
  /**
   * The tool that orders its migrations as files of their own. Absent where a journal orders
   * them (drizzle-kit) and where the kit generates none.
   */
  readonly migrationTool?: MigrationTool;
}
