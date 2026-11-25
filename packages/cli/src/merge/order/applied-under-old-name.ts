/** What the migrator of drizzle does of a migration generated again, and what settles it. */
export const REPLAYED_UNDER_OLD_NAME =
  'would run it again under the new one: reset it, or add to `drizzle.__drizzle_migrations` a row whose `created_at` is the `when` of its new entry in the journal, with any `hash` (required, never compared)';

/**
 * What to do with a database that already ran a migration the landing renames or generates
 * again: its tool knows the migration by the old name, and `remedy` says what it does then.
 */
export function appliedUnderOldName(remedy: string): string {
  return `A database that already applied a migration under its old name (development, preview, shared) ${remedy}.`;
}
