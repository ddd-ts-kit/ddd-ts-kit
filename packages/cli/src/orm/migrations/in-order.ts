import type { MigrationTool } from './migration-tool';
import type { OrderedMigration } from './ordered-migration';

/** The migrations as their tool runs them. */
export function inOrder(
  comesAfter: MigrationTool['comesAfter'],
  migrations: readonly OrderedMigration[],
): OrderedMigration[] {
  return [...migrations].sort((left, right) => (left.key === right.key ? 0 : comesAfter(left.key, right.key) ? 1 : -1));
}
